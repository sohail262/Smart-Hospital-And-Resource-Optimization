// Dashboard Management System
class DashboardManager {
    constructor() {
        this.charts = {};
        this.realTimeListeners = [];
        this.live = {
            bedUtilizationLabels: [],
            bedUtilizationValues: [],
            resourceCounts: { beds: 0, ventilators: 0, monitors: 0, ivPumps: 0, wheelchairs: 0 }
        };
        this.lastAnalyticsWrite = 0;
        this.init();
    }

    async init() {
        try {
            await this.checkAuth();
            await this.loadUserInfo();
            await this.initializeRealTimeData();
            await this.loadDashboardMetrics();
            this.setupCharts();
            this.startAutoRefresh();
        } catch (error) {
            console.error('Dashboard initialization error:', error);
        }
    }

    async checkAuth() {
        return new Promise((resolve) => {
            auth.onAuthStateChanged(user => {
                if (user) {
                    this.currentUser = user;
                    resolve(user);
                } else {
                    window.location.href = 'index.html';
                }
            });
        });
    }

    async loadUserInfo() {
        try {
            const userDoc = await window.collections.users.doc(this.currentUser.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                document.getElementById('userName').textContent = userData.fullName || 'User';
                document.getElementById('userRole').textContent = userData.role || 'Staff';
            }
        } catch (error) {
            console.error('Error loading user info:', error);
        }
    }

    async initializeRealTimeData() {
        // Real-time bed occupancy
        this.realTimeListeners.push(
            window.collections.beds.onSnapshot(snapshot => {
                this.updateBedOccupancy(snapshot);
                // Also reflect in the line chart live
                const { total, occupied } = this.getBedTotals(snapshot);
                const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
                this.updateBedChart(occupancyRate);
                this.maybePersistBedUtilization(occupancyRate);
            })
        );

        // Real-time patient count
        this.realTimeListeners.push(
            window.collections.patients
                .where('status', '==', 'active')
                .onSnapshot(snapshot => {
                    document.getElementById('activePatients').textContent = snapshot.size;
                })
        );

        // Real-time staff monitoring
        this.realTimeListeners.push(
            window.collections.staff
                .where('status', '==', 'on-duty')
                .onSnapshot(snapshot => {
                    this.updateStaffMetrics(snapshot);
                })
        );

        // Live resource distribution from resources collection
        this.realTimeListeners.push(
            window.collections.resources.onSnapshot(snapshot => {
                const counts = { beds: 0, ventilators: 0, monitors: 0, ivPumps: 0, wheelchairs: 0 };
                snapshot.forEach(doc => {
                    const r = doc.data();
                    const type = (r.type || r.category || '').toString().toLowerCase();
                    if (type === 'bed') counts.beds++;
                    else if (type === 'ventilator') counts.ventilators++;
                    else if (type === 'monitor') counts.monitors++;
                    else if (type === 'iv_pump') counts.ivPumps++;
                    else if (type === 'wheelchair') counts.wheelchairs++;
                });
                this.live.resourceCounts = counts;
                this.updateResourceDistributionChart();
            })
        );

        // Real-time alerts
        this.realTimeListeners.push(
            window.collections.alerts
                .where('priority', '==', 'critical')
                .where('resolved', '==', false)
                .onSnapshot(snapshot => {
                    document.getElementById('criticalAlerts').textContent = snapshot.size;
                    this.updateAlertsFeed(snapshot);
                })
        );

        // Department status
        this.realTimeListeners.push(
            window.collections.departments.onSnapshot(snapshot => {
                this.updateDepartmentStatus(snapshot);
            })
        );

        // Activity feed
        this.realTimeListeners.push(
            window.collections.activities
                .orderBy('timestamp', 'desc')
                .limit(20)
                .onSnapshot(snapshot => {
                    this.updateActivityFeed(snapshot);
                })
        );
    }

    updateBedOccupancy(snapshot) {
        const { total, occupied } = this.getBedTotals(snapshot);
        
        const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
        document.getElementById('bedOccupancy').textContent = `${occupancyRate}%`;
        document.getElementById('bedProgress').style.width = `${occupancyRate}%`;
        
        // Update trend
        const trend = occupancyRate > 75 ? '↑ High' : occupancyRate > 50 ? '→ Normal' : '↓ Low';
        document.getElementById('bedTrend').textContent = trend;
        document.getElementById('bedTrend').className = `text-sm font-medium ${
            occupancyRate > 75 ? 'text-red-600' : occupancyRate > 50 ? 'text-blue-600' : 'text-green-600'
        }`;
    }

    getBedTotals(snapshot) {
        let total = 0;
        let occupied = 0;
        snapshot.forEach(doc => {
            const bed = doc.data();
            total++;
            if ((bed.status || '').toString().toLowerCase() === 'occupied') occupied++;
        });
        return { total, occupied };
    }

    updateBedChart(occupancyRate) {
        if (!this.charts.bedUtilization) return;
        const now = new Date();
        const label = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        this.live.bedUtilizationLabels.push(label);
        this.live.bedUtilizationValues.push(occupancyRate);
        // Keep last 24 points
        if (this.live.bedUtilizationLabels.length > 24) {
            this.live.bedUtilizationLabels.shift();
            this.live.bedUtilizationValues.shift();
        }
        this.charts.bedUtilization.data.labels = [...this.live.bedUtilizationLabels];
        this.charts.bedUtilization.data.datasets[0].data = [...this.live.bedUtilizationValues];
        this.charts.bedUtilization.update('none');
    }

    updateResourceDistributionChart() {
        if (!this.charts.resourceDistribution) return;
        const c = this.live.resourceCounts;
        const data = [c.beds, c.ventilators, c.monitors, c.ivPumps, c.wheelchairs];
        const total = data.reduce((a,b)=>a+b,0);
        if (total === 0) {
            this.charts.resourceDistribution.data.labels = ['No data'];
            this.charts.resourceDistribution.data.datasets[0].data = [1];
            this.charts.resourceDistribution.data.datasets[0].backgroundColor = ['#e5e7eb'];
        } else {
            this.charts.resourceDistribution.data.labels = ['Beds','Ventilators','Monitors','IV Pumps','Wheelchairs'];
            this.charts.resourceDistribution.data.datasets[0].data = data;
        }
        this.charts.resourceDistribution.update('none');
    }

    maybePersistBedUtilization(occupancyRate) {
        const now = Date.now();
        if (now - this.lastAnalyticsWrite < 5 * 60 * 1000) return; // 5 minutes
        this.lastAnalyticsWrite = now;
        try {
            window.collections.analytics.add({
                type: 'bed_utilization',
                value: occupancyRate,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.warn('Failed to persist analytics', e);
        }
    }

    updateStaffMetrics(snapshot) {
        let doctors = 0;
        let nurses = 0;
        
        snapshot.forEach(doc => {
            const staff = doc.data();
            const role = (staff.role || '').toString().toLowerCase();
            if (role === 'doctor') doctors++;
            else if (role === 'nurse') nurses++;
        });
        
        document.getElementById('staffOnDuty').textContent = snapshot.size;
        document.getElementById('doctorsCount').textContent = doctors;
        document.getElementById('nursesCount').textContent = nurses;
        
        // Check staff adequacy
        const staffRatio = snapshot.size / (document.getElementById('activePatients').textContent || 1);
        const status = staffRatio > 0.3 ? 'Optimal' : staffRatio > 0.2 ? 'Adequate' : 'Low';
        document.getElementById('staffStatus').textContent = status;
        document.getElementById('staffStatus').className = `text-sm font-medium ${
            status === 'Optimal' ? 'text-green-600' : status === 'Adequate' ? 'text-yellow-600' : 'text-red-600'
        }`;
    }

    updateDepartmentStatus(snapshot) {
        const container = document.getElementById('departmentList');
        container.innerHTML = '';
        
        snapshot.forEach(doc => {
            const dept = doc.data();
            const utilizationRate = dept.capacity > 0 ? Math.round((dept.currentLoad / dept.capacity) * 100) : 0;
            
            const statusColor = utilizationRate > 90 ? 'red' : utilizationRate > 70 ? 'yellow' : 'green';
            
            container.innerHTML += `
                <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                     onclick="viewDepartmentDetails('${doc.id}')">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 bg-${statusColor}-100 rounded-lg flex items-center justify-center">
                            <i class="ri-building-2-line text-${statusColor}-600"></i>
                        </div>
                        <div>
                            <h4 class="font-medium text-gray-800">${dept.name}</h4>
                            <p class="text-sm text-gray-500">${dept.currentLoad} / ${dept.capacity} beds</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-2xl font-bold text-${statusColor}-600">${utilizationRate}%</p>
                        <p class="text-xs text-gray-500">Utilization</p>
                    </div>
                </div>
            `;
        });
    }

    updateActivityFeed(snapshot) {
        const container = document.getElementById('activityFeed');
        container.innerHTML = '';
        
        snapshot.forEach(doc => {
            const activity = doc.data();
            const timeAgo = this.getTimeAgo(activity.timestamp?.toDate());
            
            const iconMap = {
                admission: { icon: 'user-add-line', color: 'blue' },
                discharge: { icon: 'user-follow-line', color: 'green' },
                emergency: { icon: 'alarm-warning-line', color: 'red' },
                transfer: { icon: 'exchange-line', color: 'purple' },
                alert: { icon: 'alert-line', color: 'orange' }
            };
            
            const { icon, color } = iconMap[activity.type] || { icon: 'information-line', color: 'gray' };
            
            container.innerHTML += `
                <div class="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
                    <div class="w-8 h-8 bg-${color}-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <i class="ri-${icon} text-${color}-600 text-sm"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-gray-800 line-clamp-2">${activity.message}</p>
                        <p class="text-xs text-gray-500 mt-1">${timeAgo}</p>
                    </div>
                </div>
            `;
        });
    }

    updateAlertsFeed(snapshot) {
        // This method handles the alerts feed updates
        // For now, we'll just update the count as the main dashboard shows activity feed
        console.log(`Updated alerts: ${snapshot.size} critical alerts`);
    }

    getTimeAgo(date) {
        if (!date) return 'Just now';
        const seconds = Math.floor((new Date() - date) / 1000);
        
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };
        
        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
            }
        }
        
        return 'Just now';
    }

    setupCharts() {
        if (typeof Chart === 'undefined') {
            // Retry shortly if Chart.js hasn't loaded yet
            setTimeout(() => this.setupCharts(), 200);
            return;
        }
        // Bed Utilization Trend Chart
        const bedCtx = document.getElementById('bedUtilizationChart').getContext('2d');
        this.charts.bedUtilization = new Chart(bedCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Bed Occupancy %',
                    data: [],
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });

        // Resource Distribution Chart
        const resourceCtx = document.getElementById('resourceDistributionChart').getContext('2d');
                this.charts.resourceDistribution = new Chart(resourceCtx, {
            type: 'doughnut',
            data: {
                labels: ['Beds', 'Ventilators', 'Monitors', 'IV Pumps', 'Wheelchairs'],
                datasets: [{
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: [
                        'rgb(59, 130, 246)',
                        'rgb(16, 185, 129)',
                        'rgb(251, 146, 60)',
                        'rgb(147, 51, 234)',
                        'rgb(244, 63, 94)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        });

        // Load chart data
        this.loadChartData();
    }

    async loadChartData() {
        // Load bed utilization trend (last 24 hours)
        const now = new Date();
        const last24Hours = new Date(now - 24 * 60 * 60 * 1000);
        
        try {
            const analyticsSnapshot = await window.collections.analytics
                .where('type', '==', 'bed_utilization')
                .where('timestamp', '>=', last24Hours)
                .orderBy('timestamp')
                .get();
            
            const labels = [];
            const data = [];
            
            analyticsSnapshot.forEach(doc => {
                const record = doc.data();
                const time = record.timestamp?.toDate ? record.timestamp.toDate() : new Date();
                labels.push(time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
                data.push(typeof record.value === 'number' ? record.value : 0);
            });

            // Fallback: if no analytics yet, seed with 6 zero points so chart renders
            if (labels.length === 0) {
                const points = 6;
                for (let i = points - 1; i >= 0; i--) {
                    const t = new Date(now - (i * 60 * 60 * 1000));
                    labels.push(t.toLocaleTimeString('en-US', { hour: '2-digit' }));
                    data.push(0);
                }
            }
            
            this.charts.bedUtilization.data.labels = labels;
            this.charts.bedUtilization.data.datasets[0].data = data;
            this.charts.bedUtilization.update('none');
            
            // Load resource distribution
            const resourceSnapshot = await window.collections.resources.get();
            const resourceCounts = {
                beds: 0,
                ventilators: 0,
                monitors: 0,
                ivPumps: 0,
                wheelchairs: 0
            };
            
            resourceSnapshot.forEach(doc => {
                const resource = doc.data();
                switch((resource.type || resource.category || '').toString().toLowerCase()) {
                    case 'bed': resourceCounts.beds++; break;
                    case 'ventilator': resourceCounts.ventilators++; break;
                    case 'monitor': resourceCounts.monitors++; break;
                    case 'iv_pump': resourceCounts.ivPumps++; break;
                    case 'wheelchair': resourceCounts.wheelchairs++; break;
                }
            });
            const dist = Object.values(resourceCounts);
            const total = dist.reduce((a,b)=>a+b,0);
            if (total === 0) {
                // Fallback slice so the chart is visible when there is no data
                this.charts.resourceDistribution.data.labels = ['No data'];
                this.charts.resourceDistribution.data.datasets[0].data = [1];
                this.charts.resourceDistribution.data.datasets[0].backgroundColor = ['#e5e7eb'];
            } else {
                this.charts.resourceDistribution.data.labels = ['Beds','Ventilators','Monitors','IV Pumps','Wheelchairs'];
                this.charts.resourceDistribution.data.datasets[0].data = dist;
            }
            this.charts.resourceDistribution.update('none');
            
        } catch (error) {
            console.error('Error loading chart data:', error);
        }
    }

    async loadDashboardMetrics() {
        // Update system metrics only
        await this.updateSystemMetrics();
    }


    async updateSystemMetrics() {
        // Record current metrics for analytics
        const metrics = {
            bedOccupancy: parseInt(document.getElementById('bedOccupancy').textContent),
            activePatients: parseInt(document.getElementById('activePatients').textContent),
            staffOnDuty: parseInt(document.getElementById('staffOnDuty').textContent),
            criticalAlerts: parseInt(document.getElementById('criticalAlerts').textContent)
        };
        
        await window.collections.analytics.add({
            type: 'system_metrics',
            metrics: metrics,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    startAutoRefresh() {
        // Refresh charts every 5 minutes
        setInterval(() => {
            this.loadChartData();
        }, 5 * 60 * 1000);
        
        // No AI insights on dashboard
    }

    cleanup() {
        // Unsubscribe from all listeners
        this.realTimeListeners.forEach(unsubscribe => unsubscribe());
        this.realTimeListeners = [];
    }
}

// Global functions
async function viewAllAlerts() {
    window.location.href = 'emergency.html';
}

async function refreshDepartments() {
    const btn = event.target;
    btn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-1"></i>Refreshing';
    btn.disabled = true;
    
    setTimeout(() => {
        btn.innerHTML = '<i class="ri-refresh-line mr-1"></i>Refresh';
        btn.disabled = false;
    }, 1000);
}

async function viewDepartmentDetails(deptId) {
    window.location.href = `resources.html?department=${deptId}`;
}

async function viewInsightDetails(insightId) {
    window.location.href = `ai-insights.html?id=${insightId}`;
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('-translate-x-full');
}

async function signOut() {
    try {
        await auth.signOut();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Sign out error:', error);
    }
}

// Quick Action Functions
function openAddPatientQuickAction() {
    document.getElementById('aabhaVerificationModal').classList.remove('hidden');
}

function closeAabhaVerificationModal() {
    document.getElementById('aabhaVerificationModal').classList.add('hidden');
}

function handleAabhaResponse(hasAabha) {
    closeAabhaVerificationModal();
    
    if (hasAabha) {
        // User has AABHA ID, open patient form
        openDashboardAddPatientModal();
    } else {
        // User doesn't have AABHA ID, redirect to AABHA creation page
        if (confirm('You will be redirected to the AABHA ID information page. After creating your AABHA ID, you can return to add the patient.\n\nClick OK to proceed.')) {
            window.open('abha-patient.html', '_blank');
        }
    }
}

function openDashboardAddPatientModal() {
    // Load departments first
    loadDepartmentsForDashboard();
    document.getElementById('dashboardAddPatientModal').classList.remove('hidden');
}

function closeDashboardAddPatientModal() {
    document.getElementById('dashboardAddPatientModal').classList.add('hidden');
    document.getElementById('dashboardAddPatientForm').reset();
}

async function loadDepartmentsForDashboard() {
    const select = document.getElementById('dash_patientDepartment');
    select.innerHTML = '<option value="">Select Department</option>';
    
    try {
        const snapshot = await window.collections.departments.get();
        snapshot.forEach(doc => {
            const dept = doc.data();
            select.innerHTML += `<option value="${doc.id}">${dept.name}</option>`;
        });
    } catch (error) {
        console.error('Error loading departments:', error);
    }
}

// Handle dashboard add patient form submission
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('dashboardAddPatientForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addPatientFromDashboard();
        });
    }
});

async function addPatientFromDashboard() {
    const form = document.getElementById('dashboardAddPatientForm');
    const submitBtn = form.querySelector('button[type="submit"]');

    try {
        if (!window.collections || !window.collections.departments) {
            throw new Error('Firebase collections not available. Please refresh the page.');
        }
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Adding...';

        // Generate patient ID
        const patientCode = await generatePatientIdForDashboard();

        const patientData = {
            patientId: patientCode,
            aabhaId: document.getElementById('aabhaId').value || null,
            firstName: document.getElementById('dash_firstName').value,
            lastName: document.getElementById('dash_lastName').value,
            dateOfBirth: firebase.firestore.Timestamp.fromDate(
                new Date(document.getElementById('dash_dateOfBirth').value)
            ),
            gender: document.getElementById('dash_gender').value,
            contactNumber: document.getElementById('dash_contactNumber').value,
            emergencyContact: document.getElementById('dash_emergencyContact').value,
            department: document.getElementById('dash_patientDepartment').value,
            priority: document.getElementById('dash_priority').value,
            chiefComplaint: document.getElementById('dash_chiefComplaint').value,
            medicalHistory: document.getElementById('dash_medicalHistory').value,
            allergies: document.getElementById('dash_allergies').value.split(',').map(a => a.trim()).filter(a => a),
            status: 'active',
            admittedAt: firebase.firestore.FieldValue.serverTimestamp(),
            admittedBy: auth.currentUser.uid
        };

        // Get department name
        const deptDoc = await window.collections.departments.doc(patientData.department).get();
        if (deptDoc.exists) {
            patientData.departmentName = deptDoc.data().name;
        }

        // Create patient
        const docRef = await window.collections.patients.add(patientData);

        // Try to assign bed
        const bedAssignment = await assignBedToPatientFromDashboard(docRef.id, patientData.department, patientData);
        
        if (!bedAssignment.success) {
            if (bedAssignment.showOptions) {
                // Show modal with options when beds are full
                await showBedFullOptions(docRef.id, patientData);
            } else {
                showNotificationDashboard(bedAssignment.message, 'warning');
                console.warn('Bed assignment failed:', bedAssignment.message);
            }
        } else {
            console.log('Bed assigned:', bedAssignment.bedNumber);
        }
        
        // Log activity
        await window.collections.activities.add({
            type: 'admission',
            message: `New patient admitted: ${patientData.firstName} ${patientData.lastName}`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            userId: auth.currentUser.uid
        });

        // Create initial vitals record
        await window.collections.vitals.add({
            patientId: docRef.id,
            recordedAt: firebase.firestore.FieldValue.serverTimestamp(),
            recordedBy: auth.currentUser.uid,
            vitals: {
                bloodPressure: '',
                heartRate: '',
                temperature: '',
                oxygenSaturation: '',
                respiratoryRate: ''
            }
        });

        // Start billing automatically
        await window.collections.patientBills.add({
            patientId: docRef.id,
            patientName: `${patientData.firstName} ${patientData.lastName}`,
            departmentId: patientData.department,
            departmentName: patientData.departmentName,
            admissionTime: firebase.firestore.FieldValue.serverTimestamp(),
            billingStartTime: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active',
            totalHours: 0,
            totalCost: 0,
            medicationCosts: [],
            totalMedicationCost: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: auth.currentUser.uid
        });
        console.log('Billing started automatically for patient:', docRef.id);

        // Update department load
        if (deptDoc.exists) {
            await window.collections.departments.doc(patientData.department).update({
                currentLoad: firebase.firestore.FieldValue.increment(1)
            });
        }

        showNotificationDashboard('Patient added successfully!', 'success');
        form.reset();
        closeDashboardAddPatientModal();

        // Optionally redirect to patients page
        if (confirm('Patient added successfully! Would you like to view the patient details?')) {
            window.location.href = 'patients.html';
        }

    } catch (error) {
        console.error('Error adding patient:', error);
        showNotificationDashboard('Error adding patient: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Add Patient';
    }
}

async function generatePatientIdForDashboard() {
    if (!window.collections || !window.collections.patients) {
        throw new Error('Firebase collections not available');
    }
    
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    
    const snapshot = await window.collections.patients
        .where('admittedAt', '>=', startOfDay)
        .where('admittedAt', '<', endOfDay)
        .get();
    
    const count = snapshot.size + 1;
    return `P${year}${month}${day}${count.toString().padStart(4, '0')}`;
}

async function assignBedToPatientFromDashboard(patientId, departmentId) {
    try {
        console.log('Attempting to assign bed for patient:', patientId, 'in department:', departmentId);
        
        // First, check if department exists
        const deptDoc = await window.collections.departments.doc(departmentId).get();
        if (!deptDoc.exists) {
            console.error('Department not found:', departmentId);
            return { success: false, message: 'Department not found' };
        }
        
        console.log('Department found:', deptDoc.data().name);
        
        // Query for available beds
        const bedsSnapshot = await window.collections.beds
            .where('departmentId', '==', departmentId)
            .where('status', '==', 'available')
            .limit(1)
            .get();

        console.log('Available beds found:', bedsSnapshot.size);

        if (!bedsSnapshot.empty) {
            const bed = bedsSnapshot.docs[0];
            const bedData = bed.data();
            
            console.log('Assigning bed:', bedData.bedNumber);
            
            await db.runTransaction(async (tx) => {
                tx.update(window.collections.beds.doc(bed.id), {
                    status: 'occupied',
                    patientId: patientId,
                    occupiedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                tx.update(window.collections.patients.doc(patientId), {
                    bedId: bed.id,
                    bedNumber: bedData.bedNumber
                });
            });
            
            console.log('Bed assigned successfully:', bedData.bedNumber);
            return { success: true, bedNumber: bedData.bedNumber };
        } else {
            // Check total beds in department
            const allBedsSnapshot = await window.collections.beds
                .where('departmentId', '==', departmentId)
                .get();
            
            console.warn(`No available beds in department. Total beds: ${allBedsSnapshot.size}`);
            
            if (allBedsSnapshot.size === 0) {
                return { 
                    success: false, 
                    message: 'No beds exist in this department. Please initialize beds first.' 
                };
            } else {
                return { 
                    success: false, 
                    showOptions: true,
                    totalBeds: allBedsSnapshot.size,
                    message: `All ${allBedsSnapshot.size} beds in this department are occupied.` 
                };
            }
        }
    } catch (error) {
        console.error('Error assigning bed:', error);
        return { success: false, message: 'Error assigning bed: ' + error.message };
    }
}

function showNotificationDashboard(message, type) {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-600' : 
                    type === 'warning' ? 'bg-orange-600' : 'bg-red-600';
    const icon = type === 'success' ? 'checkbox-circle' : 
                 type === 'warning' ? 'alert' : 'error-warning';
    
    notification.className = `fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg ${bgColor} text-white max-w-md`;
    notification.innerHTML = `
        <div class="flex items-center space-x-2">
            <i class="ri-${icon}-line text-xl"></i>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, type === 'warning' ? 5000 : 3000);
}

// Show bed full options modal
async function showBedFullOptions(patientId, patientData) {
    const modal = document.createElement('div');
    modal.id = 'bedFullModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
    
    // Get departments with available beds
    const departmentsWithBeds = await getDepartmentsWithAvailableBeds();
    
    let departmentOptions = '';
    if (departmentsWithBeds.length > 0) {
        departmentOptions = departmentsWithBeds.map(dept => 
            `<option value="${dept.id}">${dept.name} (${dept.availableBeds} beds available)</option>`
        ).join('');
    }
    
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4">
            <div class="p-6 border-b">
                <div class="flex items-center space-x-3 text-orange-600">
                    <i class="ri-alert-line text-3xl"></i>
                    <div>
                        <h3 class="text-xl font-semibold text-gray-800">No Beds Available</h3>
                        <p class="text-sm text-gray-600">All beds in ${patientData.departmentName} are currently occupied</p>
                    </div>
                </div>
            </div>
            
            <div class="p-6">
                <p class="text-gray-700 mb-6">
                    Patient <strong>${patientData.firstName} ${patientData.lastName}</strong> has been admitted but no bed could be assigned. 
                    What would you like to do?
                </p>
                
                <div class="space-y-4">
                    <!-- Option 1: Move to another department -->
                    <div class="border-2 border-gray-200 rounded-lg p-4 hover:border-blue-500 transition cursor-pointer" onclick="selectBedOption('transfer')">
                        <div class="flex items-start space-x-3">
                            <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <i class="ri-hospital-line text-blue-600 text-xl"></i>
                            </div>
                            <div class="flex-1">
                                <h4 class="font-semibold text-gray-800 mb-1">Transfer to Another Department</h4>
                                <p class="text-sm text-gray-600 mb-3">Move the patient to a department with available beds</p>
                                ${departmentOptions ? `
                                    <select id="transferDepartment" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                        <option value="">Select Department</option>
                                        ${departmentOptions}
                                    </select>
                                ` : '<p class="text-sm text-red-600">No departments with available beds</p>'}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Option 2: Shift bed from another department -->
                    <div class="border-2 border-gray-200 rounded-lg p-4 hover:border-purple-500 transition cursor-pointer" onclick="selectBedOption('shift')">
                        <div class="flex items-start space-x-3">
                            <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <i class="ri-arrow-left-right-line text-purple-600 text-xl"></i>
                            </div>
                            <div class="flex-1">
                                <h4 class="font-semibold text-gray-800 mb-1">Shift Bed from Another Department</h4>
                                <p class="text-sm text-gray-600 mb-3">Temporarily reassign a bed from another department</p>
                                ${departmentOptions ? `
                                    <select id="shiftFromDepartment" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                                        <option value="">Select Source Department</option>
                                        ${departmentOptions}
                                    </select>
                                ` : '<p class="text-sm text-red-600">No departments with available beds</p>'}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Option 3: Keep without bed -->
                    <div class="border-2 border-gray-200 rounded-lg p-4 hover:border-gray-400 transition cursor-pointer" onclick="selectBedOption('none')">
                        <div class="flex items-start space-x-3">
                            <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <i class="ri-time-line text-gray-600 text-xl"></i>
                            </div>
                            <div class="flex-1">
                                <h4 class="font-semibold text-gray-800 mb-1">Continue Without Bed Assignment</h4>
                                <p class="text-sm text-gray-600">Patient will be admitted without a bed (can be assigned later)</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="flex justify-end space-x-3 mt-6 pt-4 border-t">
                    <button onclick="closeBedFullModal()" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        Cancel
                    </button>
                    <button onclick="executeBedOption('${patientId}', '${patientData.department}')" 
                        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    window.selectedBedOption = 'none'; // Default option
}

function selectBedOption(option) {
    window.selectedBedOption = option;
    // Visual feedback
    document.querySelectorAll('#bedFullModal .border-2').forEach(el => {
        el.classList.remove('border-blue-500', 'border-purple-500', 'border-gray-400');
        el.classList.add('border-gray-200');
    });
    
    const optionMap = {
        'transfer': 'border-blue-500',
        'shift': 'border-purple-500',
        'none': 'border-gray-400'
    };
    
    event.target.closest('.border-2').classList.remove('border-gray-200');
    event.target.closest('.border-2').classList.add(optionMap[option]);
}

async function executeBedOption(patientId, originalDepartmentId) {
    const option = window.selectedBedOption;
    
    try {
        if (option === 'transfer') {
            const newDeptId = document.getElementById('transferDepartment')?.value;
            if (!newDeptId) {
                alert('Please select a department to transfer to');
                return;
            }
            
            // Transfer patient to new department
            const newDeptDoc = await window.collections.departments.doc(newDeptId).get();
            const newDept = newDeptDoc.data();
            
            await window.collections.patients.doc(patientId).update({
                department: newDeptId,
                departmentName: newDept.name
            });
            
            // Update department loads
            await window.collections.departments.doc(originalDepartmentId).update({
                currentLoad: firebase.firestore.FieldValue.increment(-1)
            });
            await window.collections.departments.doc(newDeptId).update({
                currentLoad: firebase.firestore.FieldValue.increment(1)
            });
            
            // Try to assign bed in new department
            const bedAssignment = await assignBedToPatientFromDashboard(patientId, newDeptId);
            
            // Update billing
            const billingSnapshot = await window.collections.patientBills
                .where('patientId', '==', patientId)
                .where('status', '==', 'active')
                .get();
            
            if (!billingSnapshot.empty) {
                await window.collections.patientBills.doc(billingSnapshot.docs[0].id).update({
                    departmentId: newDeptId,
                    departmentName: newDept.name
                });
            }
            
            showNotificationDashboard(`Patient transferred to ${newDept.name} and bed assigned: ${bedAssignment.bedNumber}`, 'success');
            
        } else if (option === 'shift') {
            const sourceDeptId = document.getElementById('shiftFromDepartment')?.value;
            if (!sourceDeptId) {
                alert('Please select a source department');
                return;
            }
            
            // Find an available bed in source department
            const availableBed = await window.collections.beds
                .where('departmentId', '==', sourceDeptId)
                .where('status', '==', 'available')
                .limit(1)
                .get();
            
            if (!availableBed.empty) {
                const bedDoc = availableBed.docs[0];
                const bedData = bedDoc.data();
                
                // Temporarily reassign bed to target department
                await window.collections.beds.doc(bedDoc.id).update({
                    departmentId: originalDepartmentId,
                    status: 'occupied',
                    patientId: patientId,
                    occupiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    temporaryShift: true,
                    originalDepartmentId: sourceDeptId
                });
                
                // Update patient with bed info
                await window.collections.patients.doc(patientId).update({
                    bedId: bedDoc.id,
                    bedNumber: bedData.bedNumber
                });
                
                showNotificationDashboard(`Bed ${bedData.bedNumber} temporarily shifted and assigned to patient`, 'success');
            }
            
        } else {
            // Continue without bed
            showNotificationDashboard('Patient admitted without bed assignment', 'warning');
        }
        
        closeBedFullModal();
        setTimeout(() => location.reload(), 1500);
        
    } catch (error) {
        console.error('Error executing bed option:', error);
        alert('Error: ' + error.message);
    }
}

async function getDepartmentsWithAvailableBeds() {
    const departments = [];
    const deptSnapshot = await window.collections.departments.get();
    
    for (const deptDoc of deptSnapshot.docs) {
        const dept = deptDoc.data();
        const availableBedsSnapshot = await window.collections.beds
            .where('departmentId', '==', deptDoc.id)
            .where('status', '==', 'available')
            .get();
        
        if (availableBedsSnapshot.size > 0) {
            departments.push({
                id: deptDoc.id,
                name: dept.name,
                availableBeds: availableBedsSnapshot.size
            });
        }
    }
    
    return departments;
}

function closeBedFullModal() {
    const modal = document.getElementById('bedFullModal');
    if (modal) {
        modal.remove();
    }
}

// Initialize dashboard
let dashboardManager;
document.addEventListener('DOMContentLoaded', () => {
    dashboardManager = new DashboardManager();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (dashboardManager) {
        dashboardManager.cleanup();
    }
});