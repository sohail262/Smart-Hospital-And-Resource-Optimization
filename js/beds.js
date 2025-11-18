class BedManager {
    constructor() {
        this.beds = [];
        this.patients = [];
        this.departments = [];
        this.filteredBeds = [];
        this.currentView = 'grid';
        this.listeners = [];
        
        // Store references to Firebase objects
        this.collections = window.collections;
        this.auth = window.auth;
        this.db = window.db;
        
        this.init();
    }

    async init() {
        await this.checkAuth();
        this.setupEventListeners();
        this.setupRealtimeListeners();
        this.loadDepartments();
        this.loadBeds();
    }

    async checkAuth() {
        return new Promise((resolve) => {
            window.auth.onAuthStateChanged(user => {
                if (user) {
                    this.currentUser = user;
                    resolve(user);
                } else {
                    window.location.href = 'index.html';
                }
            });
        });
    }

    setupEventListeners() {
        // Filters
        document.getElementById('departmentFilter').addEventListener('change', () => this.filterBeds());
        document.getElementById('statusFilter').addEventListener('change', () => this.filterBeds());
        document.getElementById('wardFilter').addEventListener('change', () => this.filterBeds());
        document.getElementById('bedSearch').addEventListener('input', () => this.filterBeds());

        // Bed assignment form
        document.getElementById('bedAssignmentForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.assignPatientToBed();
        });
    }

    setupRealtimeListeners() {
        // Beds listener
        this.listeners.push(
            window.collections.beds
                .orderBy('bedNumber')
                .onSnapshot(snapshot => {
                    this.beds = [];
                    snapshot.forEach(doc => {
                        this.beds.push({ id: doc.id, ...doc.data() });
                    });
                    this.filterBeds();
                    this.updateStatistics();
                })
        );

        // Patients listener
        this.listeners.push(
            window.collections.patients
                .where('status', '==', 'active')
                .onSnapshot(snapshot => {
                    this.patients = [];
                    snapshot.forEach(doc => {
                        this.patients.push({ id: doc.id, ...doc.data() });
                    });
                    this.updatePatientSelect();
                })
        );
    }

    async loadDepartments() {
        try {
            const snapshot = await window.collections.departments.get();
            const departmentSelect = document.getElementById('departmentFilter');
            const wardSelect = document.getElementById('wardFilter');
            
            departmentSelect.innerHTML = '<option value="">All Departments</option>';
            wardSelect.innerHTML = '<option value="">All Wards</option>';
            
            snapshot.forEach(doc => {
                const dept = doc.data();
                departmentSelect.innerHTML += `<option value="${doc.id}">${dept.name}</option>`;
                wardSelect.innerHTML += `<option value="${dept.name}">${dept.name}</option>`;
            });
        } catch (error) {
            console.error('Error loading departments:', error);
        }
    }

    async loadBeds() {
        try {
            // Beds are loaded via realtime listener
            this.updateStatistics();
        } catch (error) {
            console.error('Error loading beds:', error);
            this.showNotification('Error loading beds', 'error');
        }
    }

    filterBeds() {
        const departmentFilter = document.getElementById('departmentFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        const wardFilter = document.getElementById('wardFilter').value;
        const searchTerm = document.getElementById('bedSearch').value.toLowerCase();

        this.filteredBeds = this.beds.filter(bed => {
            // Department filter
            if (departmentFilter && bed.departmentId !== departmentFilter) {
                return false;
            }

            // Status filter
            if (statusFilter && bed.status !== statusFilter) {
                return false;
            }

            // Ward filter
            if (wardFilter && bed.ward !== wardFilter) {
                return false;
            }

            // Search filter
            if (searchTerm) {
                const bedNumber = bed.bedNumber?.toLowerCase() || '';
                const room = bed.room?.toLowerCase() || '';
                if (!bedNumber.includes(searchTerm) && !room.includes(searchTerm)) {
                    return false;
                }
            }

            return true;
        });

        this.renderBeds();
    }

    renderBeds() {
        if (this.currentView === 'grid') {
            this.renderGridView();
        } else {
            this.renderListView();
        }
    }

    renderGridView() {
        const gridContainer = document.getElementById('gridView');
        gridContainer.innerHTML = '';

        if (this.filteredBeds.length === 0) {
            gridContainer.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="ri-hotel-bed-line text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500">No beds found</p>
                </div>
            `;
            return;
        }

        this.filteredBeds.forEach(bed => {
            const bedCard = this.createBedCard(bed);
            gridContainer.appendChild(bedCard);
        });
    }

    renderListView() {
        const tbody = document.getElementById('bedListBody');
        tbody.innerHTML = '';

        if (this.filteredBeds.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-8 text-center text-gray-500">
                        No beds found
                    </td>
                </tr>
            `;
            return;
        }

        this.filteredBeds.forEach(bed => {
            const patient = this.getPatientForBed(bed);
            const row = this.createBedRow(bed, patient);
            tbody.appendChild(row);
        });
    }

    createBedCard(bed) {
        const patient = this.getPatientForBed(bed);
        const isOccupied = bed.status === 'occupied';
        const isMaintenance = bed.status === 'maintenance';
        
        const statusColors = {
            available: 'bg-green-100 text-green-800 border-green-200',
            occupied: 'bg-red-100 text-red-800 border-red-200',
            maintenance: 'bg-yellow-100 text-yellow-800 border-yellow-200'
        };

        const card = document.createElement('div');
        card.className = `border-2 rounded-lg p-4 cursor-pointer transition-all hover:shadow-lg ${
            isOccupied ? 'border-red-200 bg-red-50' : 
            isMaintenance ? 'border-yellow-200 bg-yellow-50' : 
            'border-green-200 bg-green-50'
        }`;
        
        card.onclick = () => this.handleBedClick(bed, patient);

        card.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center space-x-2">
                    <i class="ri-hotel-bed-line text-xl ${isOccupied ? 'text-red-600' : isMaintenance ? 'text-yellow-600' : 'text-green-600'}"></i>
                    <span class="font-semibold text-lg">${bed.bedNumber}</span>
                </div>
                <span class="px-2 py-1 text-xs font-medium rounded-full ${statusColors[bed.status]}">
                    ${bed.status.toUpperCase()}
                </span>
            </div>
            
            <div class="space-y-2">
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600">Room:</span>
                    <span class="font-medium">${bed.room || 'N/A'}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600">Ward:</span>
                    <span class="font-medium">${bed.ward || 'N/A'}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600">Department:</span>
                    <span class="font-medium">${bed.departmentName || 'N/A'}</span>
                </div>
            </div>

            ${isOccupied && patient ? `
                <div class="mt-4 pt-3 border-t border-gray-200">
                    <div class="flex items-center space-x-2 mb-2">
                        <i class="ri-user-3-line text-sm text-gray-600"></i>
                        <span class="text-sm font-medium text-gray-800">${patient.firstName} ${patient.lastName}</span>
                    </div>
                    <div class="flex justify-between text-xs text-gray-600">
                        <span>ID: ${patient.patientId}</span>
                        <span>Priority: ${patient.priority?.toUpperCase()}</span>
                    </div>
                </div>
            ` : ''}

            <div class="mt-4 flex justify-end space-x-2">
                ${!isOccupied && !isMaintenance ? `
                    <button onclick="event.stopPropagation(); openBedAssignment('${bed.id}')" 
                            class="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">
                        <i class="ri-user-add-line mr-1"></i>Assign
                    </button>
                ` : ''}
                ${isOccupied ? `
                    <button onclick="event.stopPropagation(); viewBedPatient('${bed.id}')" 
                            class="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                        <i class="ri-eye-line mr-1"></i>View Patient
                    </button>
                ` : ''}
            </div>
        `;

        return card;
    }

    createBedRow(bed, patient) {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 cursor-pointer';
        row.onclick = () => this.handleBedClick(bed, patient);

        const statusColors = {
            available: 'bg-green-100 text-green-800',
            occupied: 'bg-red-100 text-red-800',
            maintenance: 'bg-yellow-100 text-yellow-800'
        };

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <i class="ri-hotel-bed-line text-lg mr-2 ${bed.status === 'occupied' ? 'text-red-600' : bed.status === 'maintenance' ? 'text-yellow-600' : 'text-green-600'}"></i>
                    <span class="font-medium">${bed.bedNumber}</span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-medium rounded-full ${statusColors[bed.status]}">
                    ${bed.status.toUpperCase()}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${patient ? `
                    <div>
                        <div class="font-medium">${patient.firstName} ${patient.lastName}</div>
                        <div class="text-gray-500">ID: ${patient.patientId}</div>
                    </div>
                ` : 'No patient'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${bed.departmentName || 'N/A'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${patient && patient.admittedAt ? 
                    new Date(patient.admittedAt.toDate()).toLocaleDateString() : 
                    'N/A'
                }
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div class="flex space-x-2">
                    ${!bed.status || bed.status === 'available' ? `
                        <button onclick="event.stopPropagation(); openBedAssignment('${bed.id}')" 
                                class="text-blue-600 hover:text-blue-900">
                            <i class="ri-user-add-line"></i>
                        </button>
                    ` : ''}
                    ${bed.status === 'occupied' ? `
                        <button onclick="event.stopPropagation(); viewBedPatient('${bed.id}')" 
                                class="text-green-600 hover:text-green-900">
                            <i class="ri-eye-line"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        `;

        return row;
    }

    getPatientForBed(bed) {
        if (bed.status !== 'occupied' || !bed.patientId) return null;
        return this.patients.find(patient => patient.id === bed.patientId);
    }

    handleBedClick(bed, patient) {
        if (bed.status === 'occupied' && patient) {
            this.showPatientDetails(patient);
        } else if (bed.status === 'available') {
            this.openBedAssignment(bed.id);
        } else {
            this.showBedDetails(bed);
        }
    }

    async showPatientDetails(patient) {
        const modal = document.getElementById('patientDetailsModal');
        const content = document.getElementById('patientDetailsContent');

        try {
            const age = this.calculateAge(patient.dateOfBirth);
            const admittedDate = patient.admittedAt ? 
                new Date(patient.admittedAt.toDate()).toLocaleDateString() : 'N/A';

            content.innerHTML = `
                <div class="space-y-6">
                    <!-- Patient Header -->
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-4">
                            <div class="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                                <i class="ri-user-3-line text-gray-600 text-2xl"></i>
                            </div>
                            <div>
                                <h4 class="text-xl font-semibold text-gray-800">
                                    ${patient.firstName} ${patient.lastName}
                                </h4>
                                <p class="text-gray-500">Patient ID: ${patient.patientId}</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <span class="px-3 py-1 rounded-full text-sm font-medium bg-${this.getPriorityColor(patient.priority)}-100 text-${this.getPriorityColor(patient.priority)}-800">
                                ${patient.priority?.toUpperCase()}
                            </span>
                            <span class="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                                ${patient.status?.toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <!-- Patient Information -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="space-y-4">
                            <h5 class="font-semibold text-gray-800">Personal Information</h5>
                            <div class="space-y-3">
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Age</span>
                                    <span class="font-medium">${age} years</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Gender</span>
                                    <span class="font-medium">${patient.gender}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Contact</span>
                                    <span class="font-medium">${patient.contactNumber || 'N/A'}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Emergency Contact</span>
                                    <span class="font-medium">${patient.emergencyContact || 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <h5 class="font-semibold text-gray-800">Admission Details</h5>
                            <div class="space-y-3">
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Department</span>
                                    <span class="font-medium">${patient.departmentName}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Bed</span>
                                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        <i class="ri-hotel-bed-line mr-1"></i>
                                        ${patient.bedNumber}
                                    </span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Admitted</span>
                                    <span class="font-medium">${admittedDate}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Length of Stay</span>
                                    <span class="font-medium">${this.calculateLOS(patient.admittedAt)} days</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="mt-6 space-y-4">
                        <div>
                            <h5 class="font-semibold text-gray-800 mb-2">Chief Complaint</h5>
                            <p class="text-gray-700 bg-gray-50 p-3 rounded-lg">${patient.chiefComplaint}</p>
                        </div>
                        
                        ${patient.medicalHistory ? `
                            <div>
                                <h5 class="font-semibold text-gray-800 mb-2">Medical History</h5>
                                <p class="text-gray-700 bg-gray-50 p-3 rounded-lg">${patient.medicalHistory}</p>
                            </div>
                        ` : ''}
                        
                        ${patient.allergies?.length > 0 ? `
                            <div>
                                <h5 class="font-semibold text-gray-800 mb-2">Allergies</h5>
                                <div class="flex flex-wrap gap-2">
                                    ${patient.allergies.map(allergy => `
                                        <span class="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                                            ${allergy}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-end space-x-3 pt-4 border-t">
                        <button onclick="printPatientInfo('${patient.id}')" 
                            class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                            <i class="ri-printer-line mr-2"></i>Print
                        </button>
                        <button onclick="dischargePatientFromBed('${patient.id}')" 
                            class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
                            <i class="ri-logout-box-r-line mr-2"></i>Discharge
                        </button>
                    </div>
                </div>
            `;

            modal.classList.remove('hidden');

        } catch (error) {
            console.error('Error loading patient details:', error);
            this.showNotification('Error loading patient details', 'error');
        }
    }

    showBedDetails(bed) {
        // Show bed information modal
        this.showNotification(`Bed ${bed.bedNumber} - ${bed.status}`, 'info');
    }

    openBedAssignment(bedId) {
        const modal = document.getElementById('bedAssignmentModal');
        const patientSelect = document.getElementById('patientSelect');
        
        // Store bed ID for assignment
        window.currentBedId = bedId;
        
        modal.classList.remove('hidden');
    }

    closeBedAssignmentModal() {
        document.getElementById('bedAssignmentModal').classList.add('hidden');
        document.getElementById('bedAssignmentForm').reset();
        window.currentBedId = null;
    }

    async assignPatientToBed() {
        const bedId = window.currentBedId;
        const patientId = document.getElementById('patientSelect').value;
        const notes = document.getElementById('assignmentNotes').value;

        if (!bedId || !patientId) {
            this.showNotification('Please select a patient', 'error');
            return;
        }

        try {
            // Update bed status
            await window.collections.beds.doc(bedId).update({
                status: 'occupied',
                patientId: patientId,
                occupiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                assignmentNotes: notes
            });

            // Update patient with bed information
            const bed = this.beds.find(b => b.id === bedId);
            await window.collections.patients.doc(patientId).update({
                bedId: bedId,
                bedNumber: bed.bedNumber,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Log activity
            await this.logActivity('bed_assigned', `Patient assigned to bed ${bed.bedNumber}`);

            this.showNotification('Patient assigned to bed successfully', 'success');
            this.closeBedAssignmentModal();

        } catch (error) {
            console.error('Error assigning patient to bed:', error);
            this.showNotification('Error assigning patient to bed', 'error');
        }
    }

    async dischargePatientFromBed(patientId) {
        if (!confirm('Are you sure you want to discharge this patient?')) return;

        try {
            const patient = this.patients.find(p => p.id === patientId);
            if (!patient || !patient.bedId) return;

            // Update patient status
            await window.collections.patients.doc(patientId).update({
                status: 'discharged',
                dischargedAt: firebase.firestore.FieldValue.serverTimestamp(),
                dischargedBy: this.currentUser.uid
            });

            // Free up bed
            await window.collections.beds.doc(patient.bedId).update({
                status: 'available',
                patientId: null,
                lastCleaned: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Stop billing for the patient
            if (window.billingManager) {
                await window.billingManager.stopPatientBilling(patientId, new Date());
            }

            // Log activity
            await this.logActivity('patient_discharged', `Patient discharged from bed ${patient.bedNumber}`);

            this.showNotification('Patient discharged successfully', 'success');
            this.closePatientDetailsModal();

        } catch (error) {
            console.error('Error discharging patient:', error);
            this.showNotification('Error discharging patient', 'error');
        }
    }

    updatePatientSelect() {
        const patientSelect = document.getElementById('patientSelect');
        patientSelect.innerHTML = '<option value="">Choose a patient...</option>';
        
        // Filter patients without beds
        const patientsWithoutBeds = this.patients.filter(patient => !patient.bedId);
        
        patientsWithoutBeds.forEach(patient => {
            const option = document.createElement('option');
            option.value = patient.id;
            option.textContent = `${patient.firstName} ${patient.lastName} (${patient.patientId})`;
            patientSelect.appendChild(option);
        });
    }

    updateStatistics() {
        const total = this.beds.length;
        const available = this.beds.filter(bed => bed.status === 'available').length;
        const occupied = this.beds.filter(bed => bed.status === 'occupied').length;
        const maintenance = this.beds.filter(bed => bed.status === 'maintenance').length;

        document.getElementById('totalBeds').textContent = total;
        document.getElementById('availableBeds').textContent = available;
        document.getElementById('occupiedBeds').textContent = occupied;
        document.getElementById('maintenanceBeds').textContent = maintenance;
    }

    toggleView(view) {
        this.currentView = view;
        
        // Update button states
        document.getElementById('gridViewBtn').className = view === 'grid' ? 
            'px-3 py-1 bg-blue-600 text-white rounded-lg text-sm' : 
            'px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm';
        document.getElementById('listViewBtn').className = view === 'list' ? 
            'px-3 py-1 bg-blue-600 text-white rounded-lg text-sm' : 
            'px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm';

        // Show/hide views
        document.getElementById('gridView').classList.toggle('hidden', view !== 'grid');
        document.getElementById('listView').classList.toggle('hidden', view !== 'list');

        this.renderBeds();
    }

    calculateAge(dateOfBirth) {
        if (!dateOfBirth) return 'N/A';
        const dob = dateOfBirth.toDate ? dateOfBirth.toDate() : new Date(dateOfBirth);
        const ageDiff = Date.now() - dob.getTime();
        const ageDate = new Date(ageDiff);
        return Math.abs(ageDate.getUTCFullYear() - 1970);
    }

    calculateLOS(admittedAt) {
        if (!admittedAt) return 0;
        const admitted = admittedAt.toDate();
        const now = new Date();
        const diff = now - admitted;
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    getPriorityColor(priority) {
        const colors = {
            critical: 'red',
            high: 'orange',
            medium: 'yellow',
            low: 'gray'
        };
        return colors[priority] || 'gray';
    }

    async logActivity(type, message) {
        try {
            await window.collections.activities.add({
                type,
                message,
                userId: this.currentUser.uid,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
        
        notification.className = `fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg transform translate-x-full transition-transform z-50`;
        notification.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="ri-${type === 'success' ? 'check' : type === 'error' ? 'error-warning' : 'information'}-line"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.remove('translate-x-full'), 100);
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    async exportBedData() {
        const data = this.filteredBeds.map(bed => {
            const patient = this.getPatientForBed(bed);
            return {
                'Bed Number': bed.bedNumber,
                'Room': bed.room || 'N/A',
                'Ward': bed.ward || 'N/A',
                'Department': bed.departmentName || 'N/A',
                'Status': bed.status,
                'Patient': patient ? `${patient.firstName} ${patient.lastName}` : 'N/A',
                'Patient ID': patient ? patient.patientId : 'N/A',
                'Priority': patient ? patient.priority : 'N/A',
                'Admitted': patient && patient.admittedAt ? 
                    new Date(patient.admittedAt.toDate()).toLocaleDateString() : 'N/A'
            };
        });

        const csv = this.convertToCSV(data);
        this.downloadCSV(csv, `beds_${new Date().toISOString().split('T')[0]}.csv`);
    }

    convertToCSV(data) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvHeaders = headers.join(',');
        
        const csvRows = data.map(row => {
            return headers.map(header => {
                const value = row[header];
                return typeof value === 'string' && value.includes(',') 
                    ? `"${value}"` 
                    : value;
            }).join(',');
        });
        
        return [csvHeaders, ...csvRows].join('\n');
    }

    downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    cleanup() {
        this.listeners.forEach(unsubscribe => unsubscribe());
    }
}

// Global functions
function refreshBeds() {
    location.reload();
}

function exportBedData() {
    bedManager.exportBedData();
}

function toggleView(view) {
    bedManager.toggleView(view);
}

function openBedAssignment(bedId) {
    bedManager.openBedAssignment(bedId);
}

function closeBedAssignmentModal() {
    bedManager.closeBedAssignmentModal();
}

function viewBedPatient(bedId) {
    const bed = bedManager.beds.find(b => b.id === bedId);
    const patient = bedManager.getPatientForBed(bed);
    if (patient) {
        bedManager.showPatientDetails(patient);
    }
}

function closePatientDetailsModal() {
    document.getElementById('patientDetailsModal').classList.add('hidden');
}

function dischargePatientFromBed(patientId) {
    bedManager.dischargePatientFromBed(patientId);
}

function printPatientInfo(patientId) {
    window.print();
}

// Initialize
let bedManager;
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Firebase to be ready
    const initializeBedManager = () => {
        if (window.collections && window.collections.beds && window.auth && window.db) {
            console.log('Firebase initialized successfully, creating BedManager');
            bedManager = new BedManager();
        } else {
            console.log('Waiting for Firebase initialization...');
            // Retry after a short delay
            setTimeout(initializeBedManager, 100);
        }
    };
    
    initializeBedManager();
});

// Cleanup
window.addEventListener('beforeunload', () => {
    if (bedManager) {
        bedManager.cleanup();
    }
});

// ===== DEPARTMENT MANAGEMENT FUNCTIONS =====

function openManageDepartmentsModal() {
    document.getElementById('manageDepartmentsModal').classList.remove('hidden');
    loadDepartmentsList();
}

function closeManageDepartmentsModal() {
    document.getElementById('manageDepartmentsModal').classList.add('hidden');
    cancelDepartmentForm();
}

function openAddDepartmentForm() {
    document.getElementById('formTitle').textContent = 'Add New Department';
    document.getElementById('editDepartmentId').value = '';
    document.getElementById('addEditDepartmentForm').reset();
    document.getElementById('departmentForm').classList.remove('hidden');
}

function cancelDepartmentForm() {
    document.getElementById('departmentForm').classList.add('hidden');
    document.getElementById('addEditDepartmentForm').reset();
    document.getElementById('editDepartmentId').value = '';
}

async function loadDepartmentsList() {
    const listContainer = document.getElementById('departmentsList');
    const loadingIndicator = document.getElementById('deptLoadingIndicator');
    
    try {
        loadingIndicator.classList.remove('hidden');
        listContainer.innerHTML = '';
        
        const snapshot = await window.collections.departments.orderBy('name').get();
        
        if (snapshot.empty) {
            listContainer.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="ri-building-line text-4xl mb-2"></i>
                    <p>No departments found. Add your first department!</p>
                </div>
            `;
            loadingIndicator.classList.add('hidden');
            return;
        }
        
        // Get bed counts for all departments
        const bedsSnapshot = await window.collections.beds.get();
        const bedCounts = {};
        bedsSnapshot.forEach(doc => {
            const bed = doc.data();
            if (!bedCounts[bed.departmentId]) {
                bedCounts[bed.departmentId] = { total: 0, available: 0, occupied: 0 };
            }
            bedCounts[bed.departmentId].total++;
            if (bed.status === 'available') bedCounts[bed.departmentId].available++;
            if (bed.status === 'occupied') bedCounts[bed.departmentId].occupied++;
        });
        
        snapshot.forEach(doc => {
            const dept = doc.data();
            const deptId = doc.id;
            const beds = bedCounts[deptId] || { total: 0, available: 0, occupied: 0 };
            const occupancyRate = beds.total > 0 ? Math.round((beds.occupied / beds.total) * 100) : 0;
            
            const categoryColors = {
                'Medical': 'bg-blue-100 text-blue-800',
                'Surgical': 'bg-purple-100 text-purple-800',
                'Diagnostic': 'bg-green-100 text-green-800',
                'Emergency': 'bg-red-100 text-red-800',
                'Critical Care': 'bg-orange-100 text-orange-800'
            };
            const categoryColor = categoryColors[dept.category] || 'bg-gray-100 text-gray-800';
            
            listContainer.innerHTML += `
                <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <div class="flex items-center space-x-3 mb-2">
                                <h4 class="font-semibold text-gray-800 text-lg">${dept.name}</h4>
                                <span class="px-2 py-1 ${categoryColor} rounded text-xs font-medium">${dept.category || 'N/A'}</span>
                                <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-mono">${dept.code || 'N/A'}</span>
                            </div>
                            <div class="grid grid-cols-4 gap-4 text-sm">
                                <div>
                                    <span class="text-gray-600">Capacity:</span>
                                    <span class="font-semibold text-gray-800 ml-1">${dept.capacity || 0} beds</span>
                                </div>
                                <div>
                                    <span class="text-gray-600">Total Beds:</span>
                                    <span class="font-semibold text-gray-800 ml-1">${beds.total}</span>
                                </div>
                                <div>
                                    <span class="text-gray-600">Available:</span>
                                    <span class="font-semibold text-green-600 ml-1">${beds.available}</span>
                                </div>
                                <div>
                                    <span class="text-gray-600">Occupancy:</span>
                                    <span class="font-semibold ${occupancyRate >= 90 ? 'text-red-600' : occupancyRate >= 75 ? 'text-orange-600' : 'text-green-600'} ml-1">${occupancyRate}%</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2 ml-4">
                            <button onclick="editDepartment('${deptId}')" 
                                class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                title="Edit Department">
                                <i class="ri-edit-line text-lg"></i>
                            </button>
                            <button onclick="deleteDepartment('${deptId}', '${dept.name}', ${beds.total})" 
                                class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Delete Department">
                                <i class="ri-delete-bin-line text-lg"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        loadingIndicator.classList.add('hidden');
    } catch (error) {
        console.error('Error loading departments:', error);
        listContainer.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="ri-error-warning-line text-4xl mb-2"></i>
                <p>Error loading departments: ${error.message}</p>
            </div>
        `;
        loadingIndicator.classList.add('hidden');
    }
}

// Handle department form submission
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('addEditDepartmentForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveDepartment();
        });
    }
});

async function saveDepartment() {
    const deptId = document.getElementById('editDepartmentId').value;
    const name = document.getElementById('deptName').value.trim();
    const code = document.getElementById('deptCode').value.trim().toUpperCase();
    const category = document.getElementById('deptCategory').value;
    const capacity = parseInt(document.getElementById('deptCapacity').value) || 0;
    
    if (!name || !code || !category) {
        alert('Please fill in all required fields');
        return;
    }
    
    if (code.length !== 3) {
        alert('Department code must be exactly 3 letters');
        return;
    }
    
    try {
        const departmentData = {
            name,
            code,
            category,
            capacity,
            status: 'active',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (deptId) {
            // Update existing department
            await window.collections.departments.doc(deptId).update(departmentData);
            alert('Department updated successfully!');
        } else {
            // Create new department
            departmentData.currentLoad = 0;
            departmentData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await window.collections.departments.add(departmentData);
            alert('Department created successfully!');
        }
        
        cancelDepartmentForm();
        loadDepartmentsList();
        
        // Refresh bed manager if available
        if (bedManager) {
            bedManager.loadDepartments();
        }
    } catch (error) {
        console.error('Error saving department:', error);
        alert('Error saving department: ' + error.message);
    }
}

async function editDepartment(deptId) {
    try {
        const doc = await window.collections.departments.doc(deptId).get();
        if (!doc.exists) {
            alert('Department not found');
            return;
        }
        
        const dept = doc.data();
        document.getElementById('formTitle').textContent = 'Edit Department';
        document.getElementById('editDepartmentId').value = deptId;
        document.getElementById('deptName').value = dept.name || '';
        document.getElementById('deptCode').value = dept.code || '';
        document.getElementById('deptCategory').value = dept.category || '';
        document.getElementById('deptCapacity').value = dept.capacity || 0;
        document.getElementById('departmentForm').classList.remove('hidden');
        
        // Scroll to form
        document.getElementById('departmentForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
        console.error('Error loading department:', error);
        alert('Error loading department: ' + error.message);
    }
}

async function deleteDepartment(deptId, deptName, bedCount) {
    if (bedCount > 0) {
        alert(`Cannot delete ${deptName}. This department has ${bedCount} beds assigned. Please remove all beds first using "Manage Beds".`);
        return;
    }
    
    if (!confirm(`Are you sure you want to delete "${deptName}"?\n\nThis action cannot be undone.`)) {
        return;
    }
    
    try {
        // Check for patients in this department
        const patientsSnapshot = await window.collections.patients
            .where('department', '==', deptId)
            .where('status', '==', 'active')
            .get();
        
        if (!patientsSnapshot.empty) {
            alert(`Cannot delete ${deptName}. There are ${patientsSnapshot.size} active patients in this department.`);
            return;
        }
        
        await window.collections.departments.doc(deptId).delete();
        alert('Department deleted successfully!');
        loadDepartmentsList();
        
        // Refresh bed manager if available
        if (bedManager) {
            bedManager.loadDepartments();
        }
    } catch (error) {
        console.error('Error deleting department:', error);
        alert('Error deleting department: ' + error.message);
    }
}

// ===== MANAGE BEDS FUNCTIONS =====

async function openManageBedsModal() {
    const modal = document.getElementById('manageBedsModal');
    const select = document.getElementById('manageBedsDepartment');
    
    // Load departments
    select.innerHTML = '<option value="">Select Department</option>';
    const snapshot = await window.collections.departments.get();
    snapshot.forEach(doc => {
        const d = doc.data();
        select.innerHTML += `<option value="${doc.id}">${d.name}</option>`;
    });
    
    // Add change listener to show current bed count
    select.addEventListener('change', async (e) => {
        const deptId = e.target.value;
        if (!deptId) {
            document.getElementById('currentBedInfo').classList.add('hidden');
            return;
        }
        
        const bedsSnap = await window.collections.beds.where('departmentId', '==', deptId).get();
        const currentCount = bedsSnap.size;
        const availableCount = bedsSnap.docs.filter(d => d.data().status === 'available').length;
        
        const info = document.getElementById('currentBedInfo');
        info.innerHTML = `
            <i class="ri-information-line mr-1"></i>
            Current: ${currentCount} beds (${availableCount} available, ${currentCount - availableCount} occupied)
        `;
        info.classList.remove('hidden');
        
        document.getElementById('manageBedsCount').value = currentCount;
    });
    
    modal.classList.remove('hidden');
}

function closeManageBedsModal() {
    document.getElementById('manageBedsModal').classList.add('hidden');
}

async function saveBedCount() {
    const modal = document.getElementById('manageBedsModal');
    const deptId = document.getElementById('manageBedsDepartment').value;
    const target = parseInt(document.getElementById('manageBedsCount').value || '0');
    
    if (!deptId || isNaN(target)) {
        alert('Please select a department and enter a valid bed count');
        return;
    }
    
    try {
        // Get department info
        const deptDoc = await window.collections.departments.doc(deptId).get();
        const dept = deptDoc.data();
        
        // Get department code
        const getDepartmentCode = (name) => {
            const codes = {
                'Emergency': 'EMR', 'ICU': 'ICU', 'General Ward': 'GWD',
                'Pediatrics': 'PED', 'Surgery': 'SUR', 'Maternity': 'MAT',
                'Paediatric Medicine and Neonatology': 'PMN', 'Dermatology': 'DRM',
                'Psychiatry': 'PSY', 'Tuberculosis & Chest': 'TBC',
                'General Surgery': 'GSR', 'Orthopaedics': 'ORT',
                'Otorhinolaryngology (ENT)': 'ENT', 'Obstetrics & Gynaecology': 'OBG',
                'Ophthalmology': 'OPH', 'Anaesthesiology': 'ANS'
            };
            return codes[name] || name.substring(0, 3).toUpperCase();
        };
        
        const deptCode = getDepartmentCode(dept.name);
        
        // Count existing beds
        const bedsSnap = await window.collections.beds.where('departmentId', '==', deptId).get();
        const current = bedsSnap.size;
        
        if (current === target) {
            alert('No changes needed - department already has this many beds');
            closeManageBedsModal();
            return;
        }
        
        if (current < target) {
            // Add beds
            const toAdd = target - current;
            
            // Get highest bed index
            const existingBeds = await window.collections.beds
                .where('departmentId', '==', deptId)
                .orderBy('bedIndex', 'desc')
                .limit(1)
                .get();
            
            let startIndex = 1;
            if (!existingBeds.empty) {
                startIndex = (existingBeds.docs[0].data().bedIndex || 0) + 1;
            }
            
            for (let i = 0; i < toAdd; i++) {
                const bedIndex = startIndex + i;
                await window.collections.beds.add({
                    name: 'Hospital Bed',
                    category: 'bed',
                    departmentId: deptId,
                    departmentName: dept.name,
                    status: 'available',
                    bedNumber: `${deptCode}${bedIndex.toString().padStart(3, '0')}`,
                    bedIndex: bedIndex,
                    ward: dept.name,
                    floor: Math.floor((bedIndex - 1) / 20) + 1,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            alert(`Added ${toAdd} beds successfully`);
        } else {
            // Remove excess available beds only
            const toRemove = current - target;
            const availableSnap = await window.collections.beds
                .where('departmentId', '==', deptId)
                .where('status', '==', 'available')
                .limit(toRemove)
                .get();
            
            if (availableSnap.size < toRemove) {
                alert(`Cannot remove ${toRemove} beds. Only ${availableSnap.size} beds are available (others are occupied).`);
                return;
            }
            
            const batch = db.batch();
            availableSnap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            alert(`Removed ${toRemove} beds successfully`);
        }
        
        // Update department capacity
        await window.collections.departments.doc(deptId).update({
            capacity: target,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        closeManageBedsModal();
        
        // Refresh bed display
        if (bedManager) {
            bedManager.loadBeds();
        }
        
    } catch (error) {
        console.error('Error updating bed count:', error);
        alert('Failed to update bed count: ' + error.message);
    }
}
