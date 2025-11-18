class AnalyticsManager {
    constructor() {
        this.charts = {};
        this.data = {};
        this.dateRange = 'week';
        this.listeners = [];
        this.init();
    }

    async init() {
        await this.checkAuth();
        this.setupEventListeners();
        await this.loadAnalyticsData();
        this.initializeCharts();
        this.startRealtimeUpdates();
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

    setupEventListeners() {
        document.getElementById('dateRange').addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                document.getElementById('dateRangeModal').classList.remove('hidden');
            } else {
                this.dateRange = e.target.value;
                this.loadAnalyticsData();
            }
        });
    }

    async loadAnalyticsData() {
        const loading = this.showLoading();
        
        try {
            const dateRange = this.getDateRange();
            
            // Load various analytics data
            const [
                admissions,
                discharges,
                occupancy,
                resources,
                waitTimes,
                staffMetrics
            ] = await Promise.all([
                this.getAdmissionsData(dateRange),
                this.getDischargesData(dateRange),
                this.getOccupancyData(dateRange),
                this.getResourceUtilization(dateRange),
                this.getWaitTimeData(dateRange),
                this.getStaffMetrics(dateRange)
            ]);

            this.data = {
                admissions,
                discharges,
                occupancy,
                resources,
                waitTimes,
                staffMetrics
            };

            this.updateKPIs();
            this.updateCharts();
            this.updateMetricsTable();
            await this.generatePredictions();

        } catch (error) {
            console.error('Error loading analytics data:', error);
            this.showNotification('Error loading analytics data', 'error');
        } finally {
            this.hideLoading(loading);
        }
    }

    getDateRange() {
        const end = new Date();
        const start = new Date();

        switch (this.dateRange) {
            case 'today':
                start.setHours(0, 0, 0, 0);
                break;
            case 'week':
                start.setDate(end.getDate() - 7);
                break;
            case 'month':
                start.setDate(end.getDate() - 30);
                break;
            case 'quarter':
                start.setMonth(end.getMonth() - 3);
                break;
            case 'year':
                start.setFullYear(end.getFullYear() - 1);
                break;
        }

        return { start, end };
    }

    async getAdmissionsData(dateRange) {
        const snapshot = await window.collections.patients
            .where('admittedAt', '>=', dateRange.start)
            .where('admittedAt', '<=', dateRange.end)
            .orderBy('admittedAt')
            .get();

        const data = {};
        snapshot.forEach(doc => {
            const patient = doc.data();
            const date = patient.admittedAt.toDate().toDateString();
            data[date] = (data[date] || 0) + 1;
        });

        return data;
    }

    async getDischargesData(dateRange) {
        const snapshot = await window.collections.patients
            .where('dischargedAt', '>=', dateRange.start)
            .where('dischargedAt', '<=', dateRange.end)
            .orderBy('dischargedAt')
            .get();

        const data = {};
        snapshot.forEach(doc => {
            const patient = doc.data();
            const date = patient.dischargedAt.toDate().toDateString();
            data[date] = (data[date] || 0) + 1;
        });

        return data;
    }

    async getOccupancyData(dateRange) {
        const snapshot = await window.collections.analytics
            .where('type', '==', 'occupancy')
            .where('timestamp', '>=', dateRange.start)
            .where('timestamp', '<=', dateRange.end)
            .orderBy('timestamp')
            .get();

        const data = [];
        snapshot.forEach(doc => {
            const record = doc.data();
            data.push({
                timestamp: record.timestamp.toDate(),
                value: record.value,
                department: record.department
            });
        });

        return data;
    }

    async getResourceUtilization(dateRange) {
        const snapshot = await window.collections.resources.get();
        
        const utilization = {
            beds: { total: 0, used: 0 },
            ventilators: { total: 0, used: 0 },
            equipment: { total: 0, used: 0 }
        };

        snapshot.forEach(doc => {
            const resource = doc.data();
            switch (resource.category) {
                case 'bed':
                    utilization.beds.total++;
                    if (resource.status === 'occupied') utilization.beds.used++;
                    break;
                case 'equipment':
                    if (resource.type === 'ventilator') {
                        utilization.ventilators.total++;
                        if (resource.status === 'in-use') utilization.ventilators.used++;
                    } else {
                        utilization.equipment.total++;
                        if (resource.status === 'in-use') utilization.equipment.used++;
                    }
                    break;
            }
        });

        return utilization;
    }

    async getWaitTimeData(dateRange) {
        // Simulate wait time data - in production, this would come from actual timestamps
        const departments = ['Emergency', 'OPD', 'Surgery', 'Lab', 'Radiology'];
        const data = {};

        departments.forEach(dept => {
            data[dept] = Math.floor(Math.random() * 60) + 15; // 15-75 minutes
        });

        return data;
    }

    async getStaffMetrics(dateRange) {
        const staffSnapshot = await window.collections.staff
            .where('status', '==', 'on-duty')
            .get();

        const patientSnapshot = await window.collections.patients
            .where('status', '==', 'active')
            .get();

        return {
            totalStaff: staffSnapshot.size,
            totalPatients: patientSnapshot.size,
            ratio: staffSnapshot.size > 0 ? 
                (patientSnapshot.size / staffSnapshot.size).toFixed(1) : 0
        };
    }

    updateKPIs() {
        // Total Admissions
        const totalAdmissions = Object.values(this.data.admissions)
            .reduce((sum, count) => sum + count, 0);
        document.getElementById('totalAdmissions').textContent = totalAdmissions;

        // Average Occupancy
        if (this.data.occupancy.length > 0) {
            const avgOccupancy = this.data.occupancy
                .reduce((sum, record) => sum + record.value, 0) / this.data.occupancy.length;
            document.getElementById('avgOccupancy').textContent = `${avgOccupancy.toFixed(1)}%`;
            
            const currentOccupancy = this.data.occupancy[this.data.occupancy.length - 1]?.value || 0;
            document.getElementById('currentOccupancy').textContent = `${currentOccupancy}%`;
        }

        // Average Length of Stay
        const avgLOS = this.calculateAverageLOS();
        document.getElementById('avgLOS').textContent = `${avgLOS} days`;

        // Staff Ratio
        document.getElementById('staffRatio').textContent = `1:${this.data.staffMetrics.ratio}`;
    }

    calculateAverageLOS() {
        // This would calculate actual LOS from patient data
        return (Math.random() * 2 + 2).toFixed(1); // Simulated: 2-4 days
    }

    initializeCharts() {
        // Set fixed dimensions for all chart containers
        document.querySelectorAll('.chart-container').forEach(container => {
            container.style.height = '400px';
            container.style.width = '100%';
            container.style.position = 'relative';
        });

        // Create all charts with fixed dimensions and disabled animations
        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        };

        // Patient Flow Chart
        const patientCtx = document.getElementById('patientFlowChart').getContext('2d');
        const dates = this.generateDateLabels();
        const admissionData = dates.map(date => this.data.admissions[date] || 0);
        const dischargeData = dates.map(date => this.data.discharges[date] || 0);

        this.charts.patientFlow = new Chart(patientCtx, {
            type: 'line',
            data: {
                labels: dates.map(date => new Date(date).toLocaleDateString()),
                datasets: [{
                    label: 'Admissions',
                    data: admissionData,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }, {
                    label: 'Discharges',
                    data: dischargeData,
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                ...baseOptions,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 5
                        }
                    }
                }
            }
        });

        // Department Performance Chart
        const deptCtx = document.getElementById('departmentChart').getContext('2d');
        const departments = ['Emergency', 'ICU', 'General Ward', 'Pediatrics', 'Surgery'];
        const departmentData = departments.map(() => Math.floor(Math.random() * 30) + 70);

        this.charts.department = new Chart(deptCtx, {
            type: 'bar',
            data: {
                labels: departments,
                datasets: [{
                    label: 'Occupancy Rate (%)',
                    data: departmentData,
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(251, 146, 60, 0.8)',
                        'rgba(147, 51, 234, 0.8)',
                        'rgba(244, 63, 94, 0.8)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                ...baseOptions,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });

        // Resource Chart
        const resourceCtx = document.getElementById('resourceChart').getContext('2d');
        const resourceData = this.calculateResourceUtilization();

        this.charts.resource = new Chart(resourceCtx, {
            type: 'doughnut',
            data: {
                labels: ['Beds', 'Ventilators', 'Equipment'],
                datasets: [{
                    data: resourceData,
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(251, 146, 60, 0.8)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                ...baseOptions,
                cutout: '60%'
            }
        });

        // Wait Time Chart
        const waitCtx = document.getElementById('waitTimeChart').getContext('2d');
        const waitTimeData = Object.values(this.data.waitTimes);

        this.charts.waitTime = new Chart(waitCtx, {
            type: 'radar',
            data: {
                labels: Object.keys(this.data.waitTimes),
                datasets: [{
                    label: 'Wait Time (minutes)',
                    data: waitTimeData,
                    backgroundColor: 'rgba(147, 51, 234, 0.2)',
                    borderColor: 'rgb(147, 51, 234)',
                    pointBackgroundColor: 'rgb(147, 51, 234)',
                    pointBorderColor: '#fff'
                }]
            },
            options: {
                ...baseOptions,
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 90,
                        ticks: {
                            stepSize: 15
                        }
                    }
                }
            }
        });
    }

    // Helper method to calculate resource utilization
    calculateResourceUtilization() {
        const util = this.data.resources;
        return [
            util.beds.total > 0 ? (util.beds.used / util.beds.total * 100) : 0,
            util.ventilators.total > 0 ? (util.ventilators.used / util.ventilators.total * 100) : 0,
            util.equipment.total > 0 ? (util.equipment.used / util.equipment.total * 100) : 0
        ];
    }

    async generatePredictions() {
        // Simulate AI predictions based on historical data
        const predictions = {
            admissions: Math.floor(Math.random() * 20 + 40),
            confidence: Math.floor(Math.random() * 10 + 85),
            peakOccupancy: Math.floor(Math.random() * 10 + 85),
            peakDay: this.getRandomFutureDay(),
            alerts: Math.floor(Math.random() * 5)
        };

        document.getElementById('predictedAdmissions').textContent = predictions.admissions;
        document.getElementById('admissionConfidence').textContent = predictions.confidence;
        document.getElementById('predictedOccupancy').textContent = predictions.peakOccupancy + '%';
        document.getElementById('peakDay').textContent = predictions.peakDay;
        document.getElementById('predictedAlerts').textContent = predictions.alerts;
    }

    getRandomFutureDay() {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        return days[Math.floor(Math.random() * days.length)];
    }

    updateMetricsTable() {
        const tbody = document.getElementById('metricsTableBody');
        const metrics = [
            {
                name: 'Bed Turnover Rate',
                current: '3.2 days',
                target: '2.5 days',
                trend: 'improving',
                status: 'warning'
            },
            {
                name: 'Patient Satisfaction',
                current: '4.3/5',
                target: '4.5/5',
                trend: 'stable',
                status: 'warning'
            },
            {
                name: 'Emergency Response Time',
                current: '8 min',
                target: '10 min',
                trend: 'improving',
                status: 'success'
            },
            {
                name: 'Resource Utilization',
                current: '78%',
                target: '75-85%',
                trend: 'stable',
                status: 'success'
            },
            {
                name: 'Staff Productivity',
                current: '92%',
                target: '90%',
                trend: 'improving',
                status: 'success'
            }
        ];

        tbody.innerHTML = metrics.map(metric => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ${metric.name}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${metric.current}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${metric.target}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    ${this.getTrendIcon(metric.trend)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${this.getStatusBadge(metric.status)}
                </td>
            </tr>
        `).join('');
    }

    getTrendIcon(trend) {
        const icons = {
            improving: '<i class="ri-arrow-up-line text-green-600"></i>',
            declining: '<i class="ri-arrow-down-line text-red-600"></i>',
            stable: '<i class="ri-arrow-right-line text-gray-600"></i>'
        };
        return icons[trend] || icons.stable;
    }

    getStatusBadge(status) {
        const colors = {
            success: 'bg-green-100 text-green-800',
            warning: 'bg-yellow-100 text-yellow-800',
            danger: 'bg-red-100 text-red-800'
        };
        return `<span class="px-2 py-1 text-xs font-medium rounded-full ${colors[status]}">
            ${status.charAt(0).toUpperCase() + status.slice(1)}
        </span>`;
    }

    generateDateLabels() {
        const labels = [];
        const range = this.getDateRange();
        const current = new Date(range.start);
        
        while (current <= range.end) {
            labels.push(current.toDateString());
            current.setDate(current.getDate() + 1);
        }
        
        return labels;
    }

    startRealtimeUpdates() {
        // Update data every 5 minutes
        setInterval(() => {
            this.loadAnalyticsData();
        }, 5 * 60 * 1000);
    }

    showLoading() {
        const loading = document.createElement('div');
        loading.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        loading.innerHTML = `
            <div class="bg-white rounded-lg p-6 flex items-center space-x-3">
                <i class="ri-loader-4-line animate-spin text-2xl text-blue-600"></i>
                <span>Loading analytics data...</span>
            </div>
        `;
        document.body.appendChild(loading);
        return loading;
    }

    hideLoading(loading) {
        if (loading && loading.parentNode) {
            loading.remove();
        }
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
        
        notification.className = `fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg transform translate-x-full transition-transform z-50`;
        notification.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="ri-${type === 'success' ? 'check' : 'error-warning'}-line"></i>
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
}

// Global functions
function refreshAnalytics() {
    analyticsManager.loadAnalyticsData();
}

function exportAnalytics() {
    // Generate and download analytics report
    const data = analyticsManager.data;
    const report = {
        dateRange: analyticsManager.dateRange,
        generatedAt: new Date().toISOString(),
        kpis: {
            totalAdmissions: document.getElementById('totalAdmissions').textContent,
            avgOccupancy: document.getElementById('avgOccupancy').textContent,
            avgLOS: document.getElementById('avgLOS').textContent,
            staffRatio: document.getElementById('staffRatio').textContent
        },
        data: data
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_report_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function changeChartType(chartName, type) {
    // Implementation for changing chart types
    console.log(`Change ${chartName} to ${type}`);
}

function updateDepartmentChart() {
    // Update department chart based on selected metric
    analyticsManager.createDepartmentChart();
}

function viewDetailedPredictions() {
    // Navigate to AI insights page with predictions focus
    window.location.href = 'ai-insights.html?view=predictions';
}

function downloadMetricsReport() {
    // Generate PDF or CSV report of metrics
    const metrics = [];
    const rows = document.querySelectorAll('#metricsTableBody tr');
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        metrics.push({
            metric: cells[0].textContent.trim(),
            current: cells[1].textContent.trim(),
            target: cells[2].textContent.trim(),
            trend: cells[3].textContent.trim(),
            status: cells[4].textContent.trim()
        });
    });
    
    const csv = convertToCSV(metrics);
    downloadCSV(csv, `metrics_report_${new Date().toISOString().split('T')[0]}.csv`);
}

function closeDateRangeModal() {
    document.getElementById('dateRangeModal').classList.add('hidden');
}

function applyDateRange() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    if (startDate && endDate) {
        analyticsManager.customDateRange = { start: new Date(startDate), end: new Date(endDate) };
        analyticsManager.dateRange = 'custom';
        analyticsManager.loadAnalyticsData();
        closeDateRangeModal();
    }
}

// Utility functions
function convertToCSV(data) {
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

function downloadCSV(csv, filename) {
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

// Initialize
let analyticsManager;
document.addEventListener('DOMContentLoaded', () => {
    analyticsManager = new AnalyticsManager();
    initializeAnalyticsCharts();
});

function initializeAnalyticsCharts() {
    const chartConfigs = {
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    };

    // Initialize all analytics charts with fixed dimensions
    document.querySelectorAll('[data-chart]').forEach(container => {
        const canvas = container.querySelector('canvas');
        if (canvas) {
            container.style.height = '400px';
            canvas.style.height = '100%';
            
            // Initialize chart based on data-chart attribute
            // Chart initialization code here...
        }
    });
}