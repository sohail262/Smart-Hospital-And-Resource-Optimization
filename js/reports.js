class ReportsManager {
    constructor() {
        this.reports = [];
        this.currentReport = null;
        this.templates = {
            'daily-summary': this.dailySummaryTemplate,
            'patient-census': this.patientCensusTemplate,
            'resource-utilization': this.resourceUtilizationTemplate,
            'staff-performance': this.staffPerformanceTemplate,
            'financial-summary': this.financialSummaryTemplate,
            'quality-metrics': this.qualityMetricsTemplate,
            'emergency-response': this.emergencyResponseTemplate
        };
        this.init();
    }

    async init() {
        await this.checkAuth();
        this.setupEventListeners();
        this.injectPrintStyles();
        await this.loadRecentReports();
        
        // Check for pending report from other pages
        this.checkForPendingReport();
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

    injectPrintStyles() {
        if (document.getElementById('reports-print-styles')) return;
        const style = document.createElement('style');
        style.id = 'reports-print-styles';
        style.textContent = `
@media print {
  body * { visibility: hidden !important; }
  .print-content, .print-content * { visibility: visible !important; }
  .print-content { position: static !important; width: 100% !important; height: auto !important; background: white !important; }
  .no-print { display: none !important; }
  
  /* Hide all modal elements during print */
  .fixed { position: static !important; }
  .absolute { position: static !important; }
  .sticky { position: static !important; }
  .z-50 { z-index: auto !important; }
  .bg-black { background: transparent !important; }
  .bg-opacity-50 { background-opacity: 1 !important; }
  .shadow-xl { box-shadow: none !important; }
  .rounded-xl { border-radius: 0 !important; }
  .max-w-5xl { max-width: none !important; }
  .overflow-y-auto { overflow: visible !important; }
  .border-b, .border-t { border: none !important; }
  
  /* Make sure printed content fills the page */
  .print-content h1 { font-size: 24pt !important; margin-bottom: 12pt !important; }
  .print-content h2 { font-size: 18pt !important; margin-bottom: 8pt !important; }
  .print-content h3 { font-size: 14pt !important; margin-bottom: 6pt !important; }
  .print-content p { font-size: 12pt !important; line-height: 1.4 !important; }
  .print-content table { width: 100% !important; border-collapse: collapse !important; }
  .print-content td, .print-content th { border: 1px solid #000 !important; padding: 4pt !important; }
}
        `;
        document.head.appendChild(style);
    }

    setupEventListeners() {
        // Search and filter
        const reportSearch = document.getElementById('reportSearch');
        if (reportSearch) {
            reportSearch.addEventListener('input', () => this.filterReports());
        }
        
        const reportFilter = document.getElementById('reportFilter');
        if (reportFilter) {
            reportFilter.addEventListener('change', () => this.filterReports());
        }

        // Custom report form
        const customReportForm = document.getElementById('customReportForm');
        if (customReportForm) {
            customReportForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.generateCustomReport();
            });
        }
    }

    // Safely convert various date-like values (Firestore Timestamp, Date, number, string) to a JS Date
    parseDate(value) {
        if (!value) return null;
        if (typeof value.toDate === 'function') {
            try { return value.toDate(); } catch { /* fallthrough */ }
        }
        if (value instanceof Date) return value;
        if (typeof value === 'number') return new Date(value);
        if (typeof value === 'string') {
            const parsed = new Date(value);
            return isNaN(parsed.getTime()) ? null : parsed;
        }
        return null;
    }

    formatDateTime(value, fallback = 'N/A') {
        const d = this.parseDate(value);
        return d ? d.toLocaleString() : fallback;
    }

    formatDate(value, fallback = 'N/A') {
        const d = this.parseDate(value);
        return d ? d.toLocaleDateString() : fallback;
    }

    async checkForPendingReport() {
        const pendingReportId = sessionStorage.getItem('pendingReportId');
        if (pendingReportId) {
            // Clear the pending report ID
            sessionStorage.removeItem('pendingReportId');
            
            // Find and show the report
            let report = this.reports.find(r => r.id === pendingReportId);
            
            if (!report) {
                // If report not found in loaded reports, try to fetch it directly
                try {
                    const reportDoc = await window.collections.reports.doc(pendingReportId).get();
                    if (reportDoc.exists) {
                        report = { id: reportDoc.id, ...reportDoc.data() };
                    }
                } catch (error) {
                    console.error('Error fetching pending report:', error);
                }
            }
            
            if (report) {
                // Small delay to ensure the page is fully loaded
                setTimeout(() => {
                    this.showReportPreview(report);
                }, 500);
            } else {
                console.warn('Pending report not found:', pendingReportId);
                this.showNotification('Report not found', 'error');
            }
        }
    }

    async loadRecentReports() {
        try {
            // Check if Firebase collections are available
            if (!window.collections || !window.collections.reports) {
                console.warn('Firebase collections not available for reports');
                return;
            }
            
            const snapshot = await window.collections.reports
                .orderBy('generatedAt', 'desc')
                .limit(50)
                .get();

            this.reports = [];
            snapshot.forEach(doc => {
                this.reports.push({ id: doc.id, ...doc.data() });
            });

            // Only render table if we're on the reports page
            const reportsTableBody = document.getElementById('reportsTableBody');
            if (reportsTableBody) {
                this.renderReportsTable();
            }
        } catch (error) {
            console.error('Error loading reports:', error);
        }
    }

    renderReportsTable() {
        const tbody = document.getElementById('reportsTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        const filteredReports = this.getFilteredReports();

        if (filteredReports.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-8 text-center text-gray-500">
                        No reports found
                    </td>
                </tr>
            `;
            return;
        }

        filteredReports.forEach(report => {
            const generatedAt = this.formatDateTime(report.generatedAt || report.data?.generatedAt);

            const typeColors = {
                'daily-summary': 'blue',
                'patient-census': 'green',
                'resource-utilization': 'purple',
                'staff-performance': 'orange',
                'financial-summary': 'red',
                'quality-metrics': 'indigo',
                'emergency-response': 'yellow',
                'custom': 'gray'
            };

            const color = typeColors[report.type] || 'gray';

            tbody.innerHTML += `
                <tr class="hover:bg-gray-50 transition">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="w-10 h-10 bg-${color}-100 rounded-lg flex items-center justify-center mr-3">
                                <i class="ri-file-text-line text-${color}-600"></i>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900">${report.name}</p>
                                <p class="text-xs text-gray-500">${report.dateRange || ''}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 py-1 text-xs font-medium rounded-full bg-${color}-100 text-${color}-800">
                            ${this.formatReportType(report.type)}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${report.generatedByName || 'System'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${generatedAt}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 py-1 text-xs font-medium rounded-full ${
                            report.status === 'completed' ? 'bg-green-100 text-green-800' : 
                            report.status === 'generating' ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-red-100 text-red-800'
                        }">
                            ${report.status?.toUpperCase() || 'COMPLETED'}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onclick="viewReport('${report.id}')" 
                            class="text-blue-600 hover:text-blue-900 mr-3">
                            <i class="ri-eye-line"></i>
                        </button>
                        <button onclick="downloadReportFile('${report.id}')" 
                            class="text-green-600 hover:text-green-900 mr-3">
                            <i class="ri-download-line"></i>
                        </button>
                        <button onclick="shareReport('${report.id}')" 
                            class="text-indigo-600 hover:text-indigo-900">
                            <i class="ri-share-line"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    getFilteredReports() {
        const reportSearch = document.getElementById('reportSearch');
        const reportFilter = document.getElementById('reportFilter');
        
        const searchTerm = reportSearch ? reportSearch.value.toLowerCase() : '';
        const typeFilter = reportFilter ? reportFilter.value : '';

        return this.reports.filter(report => {
            if (searchTerm && !report.name.toLowerCase().includes(searchTerm)) {
                return false;
            }
            if (typeFilter && report.type !== typeFilter) {
                return false;
            }
            return true;
        });
    }

    formatReportType(type) {
        return type.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    async generateReport(type) {
        this.showLoading(`Generating ${this.formatReportType(type)} report...`);

        try {
            const reportData = await this.gatherReportData(type);
            const reportContent = await this.templates[type].call(this, reportData);
            
            const report = {
                name: `${this.formatReportType(type)} - ${new Date().toLocaleDateString()}`,
                type: type,
                content: reportContent,
                data: reportData,
                generatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                generatedBy: this.currentUser.uid,
                generatedByName: this.currentUser.email,
                status: 'completed',
                format: 'pdf'
            };

            const docRef = await window.collections.reports.add(report);
            report.id = docRef.id;
            
            this.currentReport = report;
            this.hideLoading();
            this.showReportPreview(report);
            
            await this.loadRecentReports();

        } catch (error) {
            console.error('Error generating report:', error);
            this.hideLoading();
            this.showNotification('Error generating report', 'error');
        }
    }

    async gatherReportData(type) {
        const endDate = new Date();
        const startDate = new Date();
        
        // Set date range based on report type
        if (type === 'daily-summary') {
            startDate.setHours(0, 0, 0, 0);
        } else {
            startDate.setDate(endDate.getDate() - 30);
        }

        // Gather various data points
        const [
            patients,
            resources,
            staff,
            admissions,
            discharges,
            alerts
        ] = await Promise.all([
            this.getPatientData(startDate, endDate),
            this.getResourceData(),
            this.getStaffData(),
            this.getAdmissionsData(startDate, endDate),
            this.getDischargesData(startDate, endDate),
            this.getAlertsData(startDate, endDate)
        ]);

        return {
            dateRange: { start: startDate, end: endDate },
            patients,
            resources,
            staff,
            admissions,
            discharges,
            alerts,
            generatedAt: new Date()
        };
    }

    async getPatientData(startDate, endDate) {
        const snapshot = await window.collections.patients
            .where('admittedAt', '>=', startDate)
            .where('admittedAt', '<=', endDate)
            .get();

        const data = {
                        total: snapshot.size,
            byDepartment: {},
            byPriority: {},
            avgLOS: 0
        };

        let totalLOS = 0;
        let dischargedCount = 0;

        snapshot.forEach(doc => {
            const patient = doc.data();
            
            // Count by department
            data.byDepartment[patient.departmentName] = 
                (data.byDepartment[patient.departmentName] || 0) + 1;
            
            // Count by priority
            data.byPriority[patient.priority] = 
                (data.byPriority[patient.priority] || 0) + 1;
            
            // Calculate LOS for discharged patients
            if (patient.status === 'discharged' && patient.dischargedAt) {
                const los = (patient.dischargedAt.toDate() - patient.admittedAt.toDate()) / (1000 * 60 * 60 * 24);
                totalLOS += los;
                dischargedCount++;
            }
        });

        data.avgLOS = dischargedCount > 0 ? (totalLOS / dischargedCount).toFixed(1) : 0;

        return data;
    }

    async getResourceData() {
        const snapshot = await window.collections.resources.get();
        
        const data = {
            beds: { total: 0, occupied: 0, available: 0 },
            equipment: { total: 0, inUse: 0, available: 0 },
            medications: { total: 0, lowStock: 0 }
        };

        snapshot.forEach(doc => {
            const resource = doc.data();
            
            if (resource.category === 'bed') {
                data.beds.total++;
                if (resource.status === 'occupied') data.beds.occupied++;
                else if (resource.status === 'available') data.beds.available++;
            } else if (resource.category === 'equipment') {
                data.equipment.total++;
                if (resource.status === 'in-use') data.equipment.inUse++;
                else if (resource.status === 'available') data.equipment.available++;
            }
        });

        // Get medication data
        const medSnapshot = await window.collections.medications.get();
        data.medications.total = medSnapshot.size;
        
        medSnapshot.forEach(doc => {
            const med = doc.data();
            if ((med.currentStock / med.minStock) < 0.5) {
                data.medications.lowStock++;
            }
        });

        return data;
    }

    async getStaffData() {
        const snapshot = await window.collections.staff.get();
        
        const data = {
            total: snapshot.size,
            onDuty: 0,
            offDuty: 0,
            byRole: {}
        };

        snapshot.forEach(doc => {
            const staff = doc.data();
            
            if (staff.status === 'on-duty') data.onDuty++;
            else data.offDuty++;
            
            data.byRole[staff.role] = (data.byRole[staff.role] || 0) + 1;
        });

        return data;
    }

    async getAdmissionsData(startDate, endDate) {
        const snapshot = await window.collections.patients
            .where('admittedAt', '>=', startDate)
            .where('admittedAt', '<=', endDate)
            .get();

        return snapshot.size;
    }

    async getDischargesData(startDate, endDate) {
        const snapshot = await window.collections.patients
            .where('dischargedAt', '>=', startDate)
            .where('dischargedAt', '<=', endDate)
            .get();

        return snapshot.size;
    }

    async getAlertsData(startDate, endDate) {
        const snapshot = await window.collections.alerts
            .where('timestamp', '>=', startDate)
            .where('timestamp', '<=', endDate)
            .get();

        const data = {
            total: snapshot.size,
            byPriority: {},
            resolved: 0
        };

        snapshot.forEach(doc => {
            const alert = doc.data();
            data.byPriority[alert.priority] = (data.byPriority[alert.priority] || 0) + 1;
            if (alert.status === 'resolved') data.resolved++;
        });

        return data;
    }

    // Report Templates
    async dailySummaryTemplate(data) {
        return {
            title: 'Daily Summary Report',
            sections: [
                {
                    title: 'Executive Summary',
                    content: `
                        <div class="mb-6">
                            <p class="text-lg mb-4">Hospital Operations Summary for ${data.generatedAt.toDateString()}</p>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="bg-blue-50 p-4 rounded">
                                    <h4 class="font-semibold text-blue-800">Total Admissions</h4>
                                    <p class="text-2xl font-bold text-blue-600">${data.admissions}</p>
                                </div>
                                <div class="bg-green-50 p-4 rounded">
                                    <h4 class="font-semibold text-green-800">Total Discharges</h4>
                                    <p class="text-2xl font-bold text-green-600">${data.discharges}</p>
                                </div>
                                <div class="bg-purple-50 p-4 rounded">
                                    <h4 class="font-semibold text-purple-800">Bed Occupancy</h4>
                                    <p class="text-2xl font-bold text-purple-600">
                                        ${Math.round((data.resources.beds.occupied / data.resources.beds.total) * 100)}%
                                    </p>
                                </div>
                                <div class="bg-orange-50 p-4 rounded">
                                    <h4 class="font-semibold text-orange-800">Staff on Duty</h4>
                                    <p class="text-2xl font-bold text-orange-600">${data.staff.onDuty}</p>
                                </div>
                            </div>
                        </div>
                    `
                },
                {
                    title: 'Patient Statistics',
                    content: this.generatePatientStatsSection(data)
                },
                {
                    title: 'Resource Utilization',
                    content: this.generateResourceSection(data)
                },
                {
                    title: 'Alerts & Issues',
                    content: this.generateAlertsSection(data)
                },
                {
                    title: 'Recommendations',
                    content: this.generateRecommendationsSection(data)
                }
            ]
        };
    }

    generatePatientStatsSection(data) {
        return `
            <div class="space-y-4">
                <div>
                    <h5 class="font-semibold mb-2">Patient Distribution by Department</h5>
                    <div class="space-y-2">
                        ${Object.entries(data.patients.byDepartment).map(([dept, count]) => `
                            <div class="flex justify-between py-1 border-b">
                                <span>${dept}</span>
                                <span class="font-medium">${count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div>
                    <h5 class="font-semibold mb-2">Patient Priority Levels</h5>
                    <div class="flex space-x-4">
                        ${Object.entries(data.patients.byPriority).map(([priority, count]) => `
                            <div class="flex-1 text-center p-3 bg-gray-50 rounded">
                                <p class="text-sm text-gray-600">${priority}</p>
                                <p class="text-xl font-bold">${count}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div>
                    <p class="text-sm"><strong>Average Length of Stay:</strong> ${data.patients.avgLOS} days</p>
                </div>
            </div>
        `;
    }

    generateResourceSection(data) {
        return `
            <div class="space-y-4">
                <div class="grid grid-cols-3 gap-4">
                    <div class="bg-gray-50 p-4 rounded">
                        <h5 class="font-semibold mb-2">Beds</h5>
                        <p>Total: ${data.resources.beds.total}</p>
                        <p>Occupied: ${data.resources.beds.occupied}</p>
                        <p>Available: ${data.resources.beds.available}</p>
                    </div>
                    <div class="bg-gray-50 p-4 rounded">
                        <h5 class="font-semibold mb-2">Equipment</h5>
                        <p>Total: ${data.resources.equipment.total}</p>
                        <p>In Use: ${data.resources.equipment.inUse}</p>
                        <p>Available: ${data.resources.equipment.available}</p>
                    </div>
                    <div class="bg-gray-50 p-4 rounded">
                        <h5 class="font-semibold mb-2">Medications</h5>
                        <p>Total Items: ${data.resources.medications.total}</p>
                        <p>Low Stock: ${data.resources.medications.lowStock}</p>
                        <p>Critical: ${data.resources.medications.lowStock > 5 ? 'Yes' : 'No'}</p>
                    </div>
                </div>
            </div>
        `;
    }

    generateAlertsSection(data) {
        return `
            <div class="space-y-4">
                <div class="bg-red-50 border border-red-200 rounded p-4">
                    <h5 class="font-semibold text-red-800 mb-2">Alert Summary</h5>
                    <p>Total Alerts: ${data.alerts.total}</p>
                    <p>Resolved: ${data.alerts.resolved}</p>
                    <p>Pending: ${data.alerts.total - data.alerts.resolved}</p>
                </div>
                ${Object.entries(data.alerts.byPriority).length > 0 ? `
                    <div>
                        <h5 class="font-semibold mb-2">Alerts by Priority</h5>
                        <div class="space-y-1">
                            ${Object.entries(data.alerts.byPriority).map(([priority, count]) => `
                                <div class="flex justify-between">
                                    <span class="capitalize">${priority}</span>
                                    <span class="font-medium">${count}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    generateRecommendationsSection(data) {
        const recommendations = [];
        
        // Bed occupancy recommendations
        const occupancyRate = (data.resources.beds.occupied / data.resources.beds.total) * 100;
        if (occupancyRate > 85) {
            recommendations.push({
                type: 'warning',
                text: 'High bed occupancy detected. Consider expediting discharges for stable patients.'
            });
        }
        
        // Staff recommendations
        const staffPatientRatio = data.staff.onDuty / data.patients.total;
        if (staffPatientRatio < 0.25) {
            recommendations.push({
                type: 'critical',
                text: 'Staff-to-patient ratio is below recommended levels. Consider calling additional staff.'
            });
        }
        
        // Medication recommendations
        if (data.resources.medications.lowStock > 5) {
            recommendations.push({
                type: 'warning',
                text: `${data.resources.medications.lowStock} medications are running low. Place orders immediately.`
            });
        }
        
        return `
            <div class="space-y-3">
                ${recommendations.length > 0 ? recommendations.map(rec => `
                    <div class="p-3 ${rec.type === 'critical' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'} border rounded">
                        <p class="text-sm">${rec.text}</p>
                    </div>
                `).join('') : '<p class="text-gray-500">No immediate actions required. System operating normally.</p>'}
            </div>
        `;
    }

    showReportPreview(report) {
        const modal = document.getElementById('reportPreviewModal');
        const content = document.getElementById('reportPreviewContent');
        
        if (!modal || !content) {
            console.warn('Report preview modal elements not found - redirecting to reports page');
            
            // If we're not on the reports page, redirect there with the report ID
            if (!window.location.pathname.includes('reports.html')) {
                // Store the report in sessionStorage for the reports page to pick up
                sessionStorage.setItem('pendingReportId', report.id);
                window.location.href = 'reports.html';
                return;
            } else {
                // If we're on reports page but modal doesn't exist, show error
                this.showNotification('Report preview not available', 'error');
                return;
            }
        }
        
        // Track the report currently shown in the preview so Download works here
        this.currentReport = report;

        content.innerHTML = `
            <div class="max-w-4xl mx-auto">
                <div class="mb-6">
                    <h1 class="text-2xl font-bold text-gray-800">${report.content.title}</h1>
                    <p class="text-gray-500">Generated on ${this.formatDateTime(report.data.generatedAt, new Date().toLocaleString())}</p>
                </div>
                
                ${report.content.sections ? report.content.sections.map(section => `
                    <div class="mb-8">
                        <h2 class="text-xl font-semibold text-gray-800 mb-4">${section.title}</h2>
                        ${section.content}
                    </div>
                `).join('') : report.content}
            </div>
        `;
        
        modal.classList.remove('hidden');
    }

    showSimpleReportPreview(report) {
        // Create a simple modal for non-reports pages
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
                <div class="p-6 border-b flex items-center justify-between">
                    <h3 class="text-xl font-semibold text-gray-800">Report Generated Successfully</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
                        <i class="ri-close-line text-xl"></i>
                    </button>
                </div>
                
                <div class="flex-1 overflow-y-auto p-6">
                    <div class="text-center mb-6">
                        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="ri-file-text-line text-green-600 text-2xl"></i>
                        </div>
                        <h4 class="text-lg font-semibold text-gray-800 mb-2">${report.name}</h4>
                        <p class="text-gray-500">Report has been generated and saved to the system</p>
                    </div>
                    
                    <div class="bg-gray-50 p-4 rounded-lg mb-6">
                        <h5 class="font-semibold text-gray-700 mb-2">Report Details:</h5>
                        <div class="text-sm text-gray-600 space-y-1">
                            <p><strong>Type:</strong> ${this.formatReportType(report.type)}</p>
                            <p><strong>Generated:</strong> ${this.formatDateTime(report.data.generatedAt, new Date().toLocaleString())}</p>
                            <p><strong>Status:</strong> <span class="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Completed</span></p>
                        </div>
                    </div>
                    
                    <div class="text-center">
                        <p class="text-sm text-gray-600 mb-4">You can view the full report and download it as PDF from the Reports page</p>
                        <div class="flex justify-center space-x-3">
                            <button onclick="downloadReportFile('${report.id}')" 
                                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                                <i class="ri-download-line mr-2"></i>Download PDF
                            </button>
                            <button onclick="window.location.href='reports.html'" 
                                class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                                <i class="ri-file-text-line mr-2"></i>View in Reports
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Auto-remove after 10 seconds if user doesn't interact
        setTimeout(() => {
            if (document.body.contains(modal)) {
                modal.remove();
            }
        }, 10000);
    }

    async generateCustomReport() {
        const reportName = document.getElementById('reportName');
        const reportStartDate = document.getElementById('reportStartDate');
        const reportEndDate = document.getElementById('reportEndDate');
        const reportFormat = document.getElementById('reportFormat');
        const reportNotes = document.getElementById('reportNotes');
        
        if (!reportName || !reportStartDate || !reportEndDate || !reportFormat || !reportNotes) {
            console.warn('Custom report form elements not found');
            return;
        }
        
        const formData = {
            name: reportName.value,
            startDate: new Date(reportStartDate.value),
            endDate: new Date(reportEndDate.value),
            sections: Array.from(document.querySelectorAll('#customReportForm input[type="checkbox"]:checked'))
                .map(cb => cb.value),
            format: reportFormat.value,
            notes: reportNotes.value
        };

        this.showLoading('Generating custom report...');

        try {
            const reportData = await this.gatherReportData('custom');
            reportData.dateRange = { start: formData.startDate, end: formData.endDate };

            const report = {
                name: formData.name,
                type: 'custom',
                data: reportData,
                config: formData,
                generatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                generatedBy: this.currentUser.uid,
                generatedByName: this.currentUser.email,
                status: 'completed',
                format: formData.format
            };

            await window.collections.reports.add(report);
            
            this.hideLoading();
            this.showNotification('Custom report generated successfully!', 'success');
            this.closeCustomReportModal();
            await this.loadRecentReports();

        } catch (error) {
            console.error('Error generating custom report:', error);
            this.hideLoading();
            this.showNotification('Error generating report', 'error');
        }
    }

    filterReports() {
        this.renderReportsTable();
    }

        showLoading(message = 'Loading...') {
        const loading = document.createElement('div');
        loading.id = 'loadingOverlay';
        loading.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        loading.innerHTML = `
            <div class="bg-white rounded-lg p-6 flex items-center space-x-3">
                <i class="ri-loader-4-line animate-spin text-2xl text-blue-600"></i>
                <span>${message}</span>
            </div>
        `;
        document.body.appendChild(loading);
    }

    hideLoading() {
        const loading = document.getElementById('loadingOverlay');
        if (loading) loading.remove();
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

    // Additional report templates
    async patientCensusTemplate(data) {
        return {
            title: 'Patient Census Report',
            sections: [
                {
                    title: 'Current Patient Population',
                    content: `
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 class="font-semibold mb-3">Department Distribution</h4>
                                ${this.generateDepartmentChart(data.patients.byDepartment)}
                            </div>
                            <div>
                                <h4 class="font-semibold mb-3">Priority Breakdown</h4>
                                ${this.generatePriorityChart(data.patients.byPriority)}
                            </div>
                        </div>
                    `
                },
                {
                    title: 'Length of Stay Analysis',
                    content: `
                        <div class="bg-gray-50 p-6 rounded">
                            <p class="text-lg mb-4">Average Length of Stay: <strong>${data.patients.avgLOS} days</strong></p>
                            <div class="grid grid-cols-3 gap-4">
                                <div class="text-center">
                                    <p class="text-sm text-gray-600">Short Stay (1-3 days)</p>
                                    <p class="text-2xl font-bold">42%</p>
                                </div>
                                <div class="text-center">
                                    <p class="text-sm text-gray-600">Medium Stay (4-7 days)</p>
                                    <p class="text-2xl font-bold">35%</p>
                                </div>
                                <div class="text-center">
                                    <p class="text-sm text-gray-600">Long Stay (8+ days)</p>
                                    <p class="text-2xl font-bold">23%</p>
                                </div>
                            </div>
                        </div>
                    `
                }
            ]
        };
    }

    async resourceUtilizationTemplate(data) {
        return {
            title: 'Resource Utilization Report',
            sections: [
                {
                    title: 'Resource Overview',
                    content: this.generateResourceOverview(data.resources)
                },
                {
                    title: 'Equipment Utilization Rates',
                    content: this.generateEquipmentUtilization(data.resources)
                },
                {
                    title: 'Critical Resource Alerts',
                    content: this.generateResourceAlerts(data.resources)
                }
            ]
        };
    }

    generateDepartmentChart(deptData) {
        const total = Object.values(deptData).reduce((sum, count) => sum + count, 0);
        
        return `
            <div class="space-y-3">
                ${Object.entries(deptData).map(([dept, count]) => {
                    const percentage = ((count / total) * 100).toFixed(1);
                    return `
                        <div>
                            <div class="flex justify-between mb-1">
                                <span class="text-sm">${dept}</span>
                                <span class="text-sm font-medium">${count} (${percentage}%)</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div class="bg-blue-600 h-2 rounded-full" style="width: ${percentage}%"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    generatePriorityChart(priorityData) {
        return `
            <div class="grid grid-cols-2 gap-4">
                ${Object.entries(priorityData).map(([priority, count]) => {
                    const colors = {
                        critical: 'red',
                        high: 'orange',
                        medium: 'yellow',
                        low: 'green'
                    };
                    const color = colors[priority] || 'gray';
                    return `
                        <div class="bg-${color}-50 border border-${color}-200 rounded p-4 text-center">
                            <p class="text-sm text-${color}-800 font-medium capitalize">${priority}</p>
                            <p class="text-2xl font-bold text-${color}-600">${count}</p>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    generateResourceOverview(resources) {
        return `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="bg-blue-50 rounded-lg p-6">
                    <h5 class="font-semibold text-blue-800 mb-3">Bed Utilization</h5>
                    <div class="space-y-2">
                        <div class="flex justify-between">
                            <span>Total Beds</span>
                            <span class="font-medium">${resources.beds.total}</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Occupied</span>
                            <span class="font-medium text-red-600">${resources.beds.occupied}</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Available</span>
                            <span class="font-medium text-green-600">${resources.beds.available}</span>
                        </div>
                        <div class="mt-3 pt-3 border-t">
                            <div class="flex justify-between">
                                <span>Utilization Rate</span>
                                <span class="font-bold">
                                    ${Math.round((resources.beds.occupied / resources.beds.total) * 100)}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="bg-green-50 rounded-lg p-6">
                    <h5 class="font-semibold text-green-800 mb-3">Equipment Status</h5>
                    <div class="space-y-2">
                        <div class="flex justify-between">
                            <span>Total Equipment</span>
                            <span class="font-medium">${resources.equipment.total}</span>
                        </div>
                        <div class="flex justify-between">
                            <span>In Use</span>
                            <span class="font-medium text-orange-600">${resources.equipment.inUse}</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Available</span>
                            <span class="font-medium text-green-600">${resources.equipment.available}</span>
                        </div>
                        <div class="mt-3 pt-3 border-t">
                            <div class="flex justify-between">
                                <span>Utilization Rate</span>
                                <span class="font-bold">
                                    ${Math.round((resources.equipment.inUse / resources.equipment.total) * 100)}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="bg-purple-50 rounded-lg p-6">
                    <h5 class="font-semibold text-purple-800 mb-3">Medication Inventory</h5>
                    <div class="space-y-2">
                        <div class="flex justify-between">
                            <span>Total Items</span>
                            <span class="font-medium">${resources.medications.total}</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Low Stock Items</span>
                            <span class="font-medium text-yellow-600">${resources.medications.lowStock}</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Critical Stock</span>
                            <span class="font-medium text-red-600">
                                ${Math.floor(resources.medications.lowStock * 0.3)}
                            </span>
                        </div>
                        <div class="mt-3 pt-3 border-t">
                            <div class="flex justify-between">
                                <span>Stock Health</span>
                                <span class="font-bold text-${
                                    resources.medications.lowStock < 5 ? 'green' : 'red'
                                }-600">
                                    ${resources.medications.lowStock < 5 ? 'Good' : 'Critical'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    generateEquipmentUtilization(resources) {
        // Simulated equipment types
        const equipmentTypes = [
            { name: 'Ventilators', total: 20, inUse: 15 },
            { name: 'Monitors', total: 50, inUse: 42 },
            { name: 'IV Pumps', total: 100, inUse: 78 },
            { name: 'Wheelchairs', total: 40, inUse: 25 },
            { name: 'Defibrillators', total: 10, inUse: 3 }
        ];

        return `
            <div class="space-y-4">
                ${equipmentTypes.map(equip => {
                    const utilization = Math.round((equip.inUse / equip.total) * 100);
                    const color = utilization > 90 ? 'red' : utilization > 70 ? 'yellow' : 'green';
                    return `
                        <div class="bg-gray-50 rounded p-4">
                            <div class="flex justify-between items-center mb-2">
                                <span class="font-medium">${equip.name}</span>
                                <span class="text-sm text-gray-600">${equip.inUse}/${equip.total}</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-3">
                                <div class="bg-${color}-500 h-3 rounded-full relative" style="width: ${utilization}%">
                                    <span class="absolute right-2 top-0 text-xs text-white font-medium">${utilization}%</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    generateResourceAlerts(resources) {
        const alerts = [];
        
        // Check bed availability
        const bedUtilization = (resources.beds.occupied / resources.beds.total) * 100;
        if (bedUtilization > 90) {
            alerts.push({
                type: 'critical',
                message: 'Critical bed shortage - Less than 10% beds available'
            });
        } else if (bedUtilization > 80) {
            alerts.push({
                type: 'warning',
                message: 'High bed occupancy - Consider discharge planning'
            });
        }
        
        // Check equipment
        const equipmentUtilization = (resources.equipment.inUse / resources.equipment.total) * 100;
        if (equipmentUtilization > 85) {
            alerts.push({
                type: 'warning',
                message: 'High equipment utilization - Limited backup available'
            });
        }
        
        // Check medications
        if (resources.medications.lowStock > 10) {
            alerts.push({
                type: 'critical',
                message: `${resources.medications.lowStock} medications require immediate restocking`
            });
        }
        
        return `
            <div class="space-y-3">
                ${alerts.length > 0 ? alerts.map(alert => `
                    <div class="p-4 ${
                        alert.type === 'critical' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
                    } border rounded-lg flex items-start space-x-3">
                        <i class="ri-alert-line text-${alert.type === 'critical' ? 'red' : 'yellow'}-600 text-xl"></i>
                        <p class="text-sm">${alert.message}</p>
                    </div>
                `).join('') : `
                    <div class="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-3">
                        <i class="ri-check-line text-green-600 text-xl"></i>
                        <p class="text-sm">All resources within normal operating parameters</p>
                    </div>
                `}
            </div>
        `;
    }

    async generateDetailedPatientReport(patientId) {
        this.showLoading('Generating detailed patient report...');

        try {
            // Check if Firebase collections are available
            if (!window.collections || !window.collections.patients) {
                this.hideLoading();
                this.showNotification('Firebase collections not available', 'error');
                return;
            }
            
            // Get patient information
            const patientDoc = await window.collections.patients.doc(patientId).get();
            if (!patientDoc.exists) {
                this.showNotification('Patient not found', 'error');
                return;
            }
            const patient = patientDoc.data();

            // Get patient vitals
            const vitalsSnapshot = await window.collections.vitals
                .where('patientId', '==', patientId)
                .orderBy('recordedAt', 'desc')
                .get();
            const vitals = vitalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Get patient medications
            const medicationsSnapshot = await window.collections.medications
                .where('patientId', '==', patientId)
                .get();
            const medications = medicationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Get AI assessments
            const assessmentsSnapshot = await window.collections.aiAssessments
                .where('patientId', '==', patientId)
                .orderBy('createdAt', 'desc')
                .get();
            const assessments = assessmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Get billing information
            const billingSnapshot = await window.collections.patientBills
                .where('patientId', '==', patientId)
                .get();
            const billing = billingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Get department information
            const departmentDoc = await window.collections.departments.doc(patient.department).get();
            const department = departmentDoc.exists ? departmentDoc.data() : null;

            const reportData = {
                patient: { id: patientId, ...patient },
                vitals: vitals,
                medications: medications,
                assessments: assessments,
                billing: billing,
                department: department,
                generatedAt: new Date()
            };

            const reportContent = this.generatePatientReportHTML(reportData);
            
            const report = {
                name: `Patient Report - ${patient.firstName} ${patient.lastName} - ${new Date().toLocaleDateString()}`,
                type: 'detailed-patient',
                content: reportContent,
                data: reportData,
                generatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                generatedBy: this.currentUser.uid,
                generatedByName: this.currentUser.email,
                status: 'completed',
                format: 'html'
            };

            const docRef = await window.collections.reports.add(report);
            report.id = docRef.id;
            
            this.currentReport = report;
            this.hideLoading();
            
            // Check if we're on the reports page
            if (window.location.pathname.includes('reports.html')) {
                this.showReportPreview(report);
            } else {
                // If not on reports page, show a simple preview and offer to download
                this.showSimpleReportPreview(report);
            }
            
            await this.loadRecentReports();

        } catch (error) {
            console.error('Error generating detailed patient report:', error);
            this.hideLoading();
            this.showNotification('Error generating patient report', 'error');
        }
    }

    generatePatientReportHTML(data) {
        const { patient, vitals, medications, assessments, billing, department } = data;
        
        return `
            <div class="max-w-4xl mx-auto p-6 bg-white">
                <!-- Header -->
                <div class="text-center mb-8 border-b pb-6">
                    <h1 class="text-3xl font-bold text-gray-800 mb-2">Patient Medical Report</h1>
                    <p class="text-gray-600">Generated on ${new Date().toLocaleDateString()}</p>
                </div>

                <!-- Patient Information -->
                <div class="mb-8">
                    <h2 class="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Patient Information</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h3 class="font-semibold text-gray-700 mb-2">Personal Details</h3>
                            <div class="space-y-2 text-sm">
                                <p><span class="font-medium">Name:</span> ${patient.firstName} ${patient.lastName}</p>
                                <p><span class="font-medium">Date of Birth:</span> ${this.formatDate(patient.dateOfBirth, 'N/A')}</p>
                                <p><span class="font-medium">Gender:</span> ${patient.gender}</p>
                                <p><span class="font-medium">Contact:</span> ${patient.phone || 'N/A'}</p>
                                <p><span class="font-medium">Emergency Contact:</span> ${patient.emergencyContact || 'N/A'}</p>
                            </div>
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-700 mb-2">Medical Information</h3>
                            <div class="space-y-2 text-sm">
                                <p><span class="font-medium">Patient ID:</span> ${patient.id}</p>
                                <p><span class="font-medium">Department:</span> ${department ? department.name : 'N/A'}</p>
                                <p><span class="font-medium">Bed Number:</span> ${patient.bedNumber || 'N/A'}</p>
                                <p><span class="font-medium">Admission Date:</span> ${this.formatDate(patient.admittedAt, 'N/A')}</p>
                                <p><span class="font-medium">Status:</span> <span class="px-2 py-1 rounded text-xs ${patient.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">${patient.status}</span></p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Medical History & Conditions -->
                <div class="mb-8">
                    <h2 class="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Medical History</h2>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="text-sm text-gray-700">${patient.medicalHistory || 'No medical history recorded'}</p>
                    </div>
                </div>

                <!-- Vital Signs -->
                <div class="mb-8">
                    <h2 class="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Vital Signs</h2>
                    ${vitals.length > 0 ? `
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-2 text-left">Date & Time</th>
                                        <th class="px-4 py-2 text-left">Blood Pressure</th>
                                        <th class="px-4 py-2 text-left">Heart Rate</th>
                                        <th class="px-4 py-2 text-left">Temperature</th>
                                        <th class="px-4 py-2 text-left">Oxygen Saturation</th>
                                        <th class="px-4 py-2 text-left">Respiratory Rate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${vitals.map(vital => `
                                        <tr class="border-b">
                                            <td class="px-4 py-2">${this.formatDateTime(vital.recordedAt, 'N/A')}</td>
                                            <td class="px-4 py-2">${vital.vitals.bloodPressure || 'N/A'}</td>
                                            <td class="px-4 py-2">${vital.vitals.heartRate || 'N/A'}</td>
                                            <td class="px-4 py-2">${vital.vitals.temperature || 'N/A'}</td>
                                            <td class="px-4 py-2">${vital.vitals.oxygenSaturation || 'N/A'}</td>
                                            <td class="px-4 py-2">${vital.vitals.respiratoryRate || 'N/A'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<p class="text-gray-500 text-center py-4">No vital signs recorded</p>'}
                </div>

                <!-- Medications -->
                <div class="mb-8">
                    <h2 class="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Medications</h2>
                    ${medications.length > 0 ? `
                        <div class="space-y-4">
                            ${medications.map(med => `
                                <div class="bg-blue-50 p-4 rounded-lg">
                                    <h3 class="font-semibold text-blue-800">${med.name}</h3>
                                    <div class="text-sm text-blue-700 mt-2">
                                        <p><span class="font-medium">Dosage:</span> ${med.dosage || 'N/A'}</p>
                                        <p><span class="font-medium">Frequency:</span> ${med.frequency || 'N/A'}</p>
                                        <p><span class="font-medium">Instructions:</span> ${med.instructions || 'N/A'}</p>
                                        <p><span class="font-medium">Prescribed By:</span> ${med.prescribedBy || 'N/A'}</p>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<p class="text-gray-500 text-center py-4">No medications prescribed</p>'}
                </div>

                <!-- AI Assessments & Recommendations -->
                <div class="mb-8">
                    <h2 class="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">AI Assessments & Recommendations</h2>
                    ${assessments.length > 0 ? `
                        <div class="space-y-4">
                            ${assessments.map(assessment => `
                                <div class="bg-green-50 p-4 rounded-lg">
                                    <h3 class="font-semibold text-green-800">Assessment - ${this.formatDate(assessment.createdAt, 'N/A')}</h3>
                                    <div class="text-sm text-green-700 mt-2">
                                        <p><span class="font-medium">Risk Level:</span> <span class="px-2 py-1 rounded text-xs ${assessment.riskLevel === 'high' ? 'bg-red-100 text-red-800' : assessment.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}">${assessment.riskLevel || 'N/A'}</span></p>
                                        <p><span class="font-medium">Assessment:</span> ${assessment.assessment || 'N/A'}</p>
                                        <p><span class="font-medium">Recommendations:</span> ${assessment.recommendations || 'N/A'}</p>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<p class="text-gray-500 text-center py-4">No AI assessments available</p>'}
                </div>

                <!-- Billing Information -->
                <div class="mb-8">
                    <h2 class="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">Billing Information</h2>
                    ${billing.length > 0 ? `
                        <div class="space-y-4">
                            ${billing.map(bill => `
                                <div class="bg-gray-50 p-4 rounded-lg">
                                    <h3 class="font-semibold text-gray-800">Billing Record</h3>
                                    <div class="text-sm text-gray-700 mt-2">
                                        <p><span class="font-medium">Status:</span> <span class="px-2 py-1 rounded text-xs ${bill.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}">${bill.status}</span></p>
                                        <p><span class="font-medium">Total Hours:</span> ${bill.totalHours || 0} hours</p>
                                        <p><span class="font-medium">Total Cost:</span> ₹${bill.totalCost || 0}</p>
                                        <p><span class="font-medium">Start Time:</span> ${this.formatDateTime(bill.billingStartTime, 'N/A')}</p>
                                        ${bill.billingEndTime ? `<p><span class=\"font-medium\">End Time:</span> ${this.formatDateTime(bill.billingEndTime)}</p>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<p class="text-gray-500 text-center py-4">No billing information available</p>'}
                </div>

                <!-- Footer -->
                <div class="text-center text-sm text-gray-500 border-t pt-4">
                    <p>This report was generated automatically by the Smart Hospital Management System</p>
                    <p>Report ID: ${data.patient.id} | Generated: ${new Date().toLocaleString()}</p>
                </div>
            </div>
        `;
    }
}

// Global functions
function generateReport(type) {
    if (!reportsManager) {
        console.error('ReportsManager not initialized yet. Please wait and try again.');
        if (window.Utils && window.Utils.showNotification) {
            window.Utils.showNotification('Reports system not ready yet. Please wait and try again.', 'error');
        }
        return;
    }
    reportsManager.generateReport(type);
}

function generateDetailedPatientReport(patientId) {
    if (!reportsManager) {
        console.log('ReportsManager not ready yet, waiting for initialization...');
        if (window.Utils && window.Utils.showNotification) {
            window.Utils.showNotification('Initializing reports system, please wait...', 'info');
        }
        
        // Wait for ReportsManager to be initialized with timeout
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds timeout (50 * 100ms)
        
        const waitForReportsManager = () => {
            attempts++;
            if (reportsManager) {
                console.log('ReportsManager is now ready, generating report...');
                reportsManager.generateDetailedPatientReport(patientId);
            } else if (attempts >= maxAttempts) {
                console.error('ReportsManager initialization timeout');
                if (window.Utils && window.Utils.showNotification) {
                    window.Utils.showNotification('Reports system failed to initialize. Please refresh the page and try again.', 'error');
                }
            } else {
                // Retry after a short delay
                setTimeout(waitForReportsManager, 100);
            }
        };
        
        waitForReportsManager();
        return;
    }
    reportsManager.generateDetailedPatientReport(patientId);
}

function showCustomReportBuilder() {
    const modal = document.getElementById('customReportModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeCustomReportModal() {
    const modal = document.getElementById('customReportModal');
    const form = document.getElementById('customReportForm');
    
    if (modal) {
        modal.classList.add('hidden');
    }
    if (form) {
        form.reset();
    }
}

function closePreviewModal() {
    const modal = document.getElementById('reportPreviewModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function viewReport(reportId) {
    if (!reportsManager) {
        console.error('ReportsManager not initialized yet. Please wait and try again.');
        return;
    }
    const report = reportsManager.reports.find(r => r.id === reportId);
    if (report) {
        reportsManager.showReportPreview(report);
    }
}

async function downloadReportFile(reportId) {
    if (!reportsManager) {
        console.error('ReportsManager not initialized yet. Please wait and try again.');
        showError('Reports system is still loading. Please wait and try again.');
        return;
    }
    const report = reportsManager.reports.find(r => r.id === reportId);
    if (!report) {
        console.error('Report not found with ID:', reportId);
        showError('Report not found');
        return;
    }
    
    console.log('Generating PDF for report:', report);
    
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'pdfLoadingIndicator';
    loadingDiv.className = 'fixed top-4 right-4 z-50 bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded-lg shadow-md';
    loadingDiv.innerHTML = `
        <div class="flex items-center">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-2"></div>
            <span>Preparing PDF download...</span>
        </div>
    `;
    document.body.appendChild(loadingDiv);
    
    try {
        // Ensure libraries are loaded before proceeding
        console.log('Checking PDF libraries availability...');
        loadingDiv.querySelector('span').textContent = 'Loading PDF libraries...';
        await ensureLibrariesLoaded();
        
        console.log('Both libraries loaded successfully, proceeding with PDF generation...');
        loadingDiv.querySelector('span').textContent = 'Converting report to PDF...';
        
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            throw new Error('jsPDF library not accessible');
        }
        
        const doc = new jsPDF('p', 'mm', 'a4');

        // Always build a clean, print-only container to avoid modal chrome/buttons
        const tempContainer = document.createElement('div');
        tempContainer.style.cssText = `
            position: absolute;
            top: -10000px;
            left: -10000px;
            width: 800px;
            padding: 24px;
            box-sizing: border-box;
            background: #ffffff;
            font-family: Arial, sans-serif;
            color: #000000;
        `;
        
        tempContainer.innerHTML = `
            <div>
                <div style="margin-bottom:16px">
                    <h1 style="font-size:22px;font-weight:700;color:#1f2937;margin:0 0 4px">${(report.content && report.content.title) ? report.content.title : report.name}</h1>
                    <p style="color:#6b7280;font-size:12px;margin:0">Generated on ${reportsManager ? reportsManager.formatDateTime(report.data.generatedAt, new Date().toLocaleString()) : new Date().toLocaleString()}</p>
                </div>
                ${report.content && report.content.sections ? report.content.sections.map(s => `
                    <div style="margin-bottom:24px">
                        <h2 style="font-size:16px;font-weight:600;color:#1f2937;margin:0 0 12px">${s.title}</h2>
                        <div style="color:#374151;line-height:1.6">${s.content}</div>
                    </div>
                `).join('') : (report.content || '')}
            </div>`;
        
        document.body.appendChild(tempContainer);

        // Use html2canvas to convert the content to canvas with enhanced error handling
        console.log('Starting html2canvas conversion...');
        loadingDiv.querySelector('span').textContent = 'Converting content to image...';
        
        let canvas;
        try {
            if (!window.html2canvas) {
                throw new Error('html2canvas library not accessible');
            }
            
            canvas = await window.html2canvas(tempContainer, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                scrollY: 0,
                backgroundColor: '#ffffff',
                removeContainer: false,
                logging: false,
                width: tempContainer.scrollWidth,
                height: tempContainer.scrollHeight
            });
            console.log('html2canvas conversion successful');
        } catch (canvasError) {
            console.error('html2canvas error:', canvasError);
            
            // Try with simplified options
            console.log('Retrying with simplified options...');
            try {
                canvas = await window.html2canvas(tempContainer, {
                    scale: 1,
                    backgroundColor: '#ffffff',
                    logging: false
                });
                console.log('html2canvas retry successful');
            } catch (retryError) {
                console.error('html2canvas retry failed:', retryError);
                throw new Error('Failed to convert content to image for PDF generation');
            }
        }

        tempContainer.remove();
        loadingDiv.querySelector('span').textContent = 'Generating PDF file...';

        // Calculate dimensions
        const imgWidth = 190; // A4 width minus margins
        const pageHeight = 277; // A4 height minus margins
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 10;

        // Add the image to PDF
        const imgData = canvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        // Add new pages if content is longer than one page
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            doc.addPage();
            doc.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        const fileName = `${report.name.replace(/[^a-z0-9\s]/gi, '_').replace(/\s+/g, '_')}.pdf`;
        doc.save(fileName);
        
        // Remove loading indicator
        loadingDiv.remove();
        
        // Show success message
        showSuccess('Report downloaded successfully!');
        
        if (reportsManager) {
            reportsManager.showNotification('Report downloaded successfully', 'success');
        }

    } catch (error) {
        console.error('Error generating PDF:', error);
        
        // Remove loading indicator
        const loadingIndicator = document.getElementById('pdfLoadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        
        // Show appropriate error message
        if (error.message && error.message.includes('PDF libraries')) {
            showError('PDF generation is currently unavailable. Please refresh the page and try again.');
        } else if (error.message && error.message.includes('convert content to image')) {
            showError('Failed to process report content. Please try again or contact support.');
        } else {
            showError('Failed to generate PDF. Please try again or contact support if the issue persists.');
        }
        
        if (reportsManager) {
            reportsManager.showNotification('Error generating PDF report. Please try again.', 'error');
        }
    }
}

// Helper function to convert HTML to plain text
function convertHtmlToText(html) {
    // Create a temporary div element
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Get text content and clean it up
    let text = tempDiv.textContent || tempDiv.innerText || '';
    
    // Remove extra whitespace and newlines
    text = text.replace(/\s+/g, ' ').trim();
    
    // Limit length to prevent PDF overflow
    if (text.length > 500) {
        text = text.substring(0, 500) + '...';
    }
    
    return text;
}

async function shareReport(reportId) {
    if (!reportsManager) {
        console.error('ReportsManager not initialized yet. Please wait and try again.');
        return;
    }
    const report = reportsManager.reports.find(r => r.id === reportId);
    if (!report) return;
    
    // Create shareable link
    const shareUrl = `${window.location.origin}/reports.html?view=${reportId}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(shareUrl).then(() => {
        if (reportsManager) {
            reportsManager.showNotification('Report link copied to clipboard', 'success');
        }
    }).catch(() => {
        if (reportsManager) {
            reportsManager.showNotification('Failed to copy link', 'error');
        }
    });
}

function scheduleReport() {
    // Show schedule modal
    alert('Report scheduling feature coming soon!');
}

function printReport() {
    if (!reportsManager || !reportsManager.currentReport) {
        console.error('No current report available for printing');
        if (reportsManager) {
            reportsManager.showNotification('No report available for printing', 'error');
        }
        return;
    }
    
    const report = reportsManager.currentReport;
    
    // Create a clean print container
    const printContainer = document.createElement('div');
    printContainer.className = 'print-content';
    printContainer.style.cssText = `
        position: absolute;
        top: -10000px;
        left: -10000px;
        width: 100%;
        background: white;
        font-family: Arial, sans-serif;
        padding: 20px;
    `;
    
    printContainer.innerHTML = `
        <div>
            <h1 style="font-size:24pt;font-weight:bold;margin-bottom:12pt">${(report.content && report.content.title) ? report.content.title : report.name}</h1>
            <p style="color:#666;font-size:12pt;margin-bottom:24pt">Generated on ${reportsManager.formatDateTime(report.data.generatedAt, new Date().toLocaleString())}</p>
            ${report.content && report.content.sections ? report.content.sections.map(s => `
                <div style="margin-bottom:24pt">
                    <h2 style="font-size:18pt;font-weight:bold;margin-bottom:8pt">${s.title}</h2>
                    <div>${s.content}</div>
                </div>
            `).join('') : (report.content || '')}
        </div>
    `;
    
    document.body.appendChild(printContainer);
    
    // Temporarily hide all other content and show only print content
    const originalDisplay = document.body.style.cssText;
    const allElements = document.body.children;
    const originalVisibility = [];
    
    // Hide all elements except our print container
    for (let i = 0; i < allElements.length; i++) {
        if (allElements[i] !== printContainer) {
            originalVisibility[i] = allElements[i].style.visibility;
            allElements[i].style.visibility = 'hidden';
        }
    }
    
    // Position print container for printing
    printContainer.style.cssText = `
        position: static;
        top: auto;
        left: auto;
        width: 100%;
        background: white;
        font-family: Arial, sans-serif;
        padding: 20px;
    `;
    
    // Trigger print
    window.print();
    
    // Restore original state after print dialog closes
    setTimeout(() => {
        // Restore visibility of other elements
        for (let i = 0; i < allElements.length; i++) {
            if (allElements[i] !== printContainer) {
                allElements[i].style.visibility = originalVisibility[i] || '';
            }
        }
        
        // Remove print container
        if (printContainer.parentNode) {
            printContainer.parentNode.removeChild(printContainer);
        }
    }, 1000);
}

function downloadReport() {
    if (!reportsManager) {
        console.error('ReportsManager not initialized yet. Please wait and try again.');
        return;
    }
    if (reportsManager.currentReport) {
        downloadReportFile(reportsManager.currentReport.id);
    } else {
        console.error('No current report available for download');
        if (reportsManager) {
            reportsManager.showNotification('No report available for download', 'error');
        }
    }
}

// Initialize
let reportsManager;

// Function to ensure libraries are loaded
// Add user-friendly error display function
function showError(message) {
    // Create or update error notification
    let errorDiv = document.getElementById('errorNotification');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'errorNotification';
        errorDiv.className = 'fixed top-4 right-4 z-50 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-md max-w-md';
        document.body.appendChild(errorDiv);
    }
    
    errorDiv.innerHTML = `
        <div class="flex items-center">
            <i class="ri-error-warning-line text-red-500 mr-2"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-red-500 hover:text-red-700">
                <i class="ri-close-line"></i>
            </button>
        </div>
    `;
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        if (errorDiv && errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 10000);
}

function showSuccess(message) {
    // Create success notification
    const successDiv = document.createElement('div');
    successDiv.className = 'fixed top-4 right-4 z-50 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg shadow-md max-w-md';
    successDiv.innerHTML = `
        <div class="flex items-center">
            <i class="ri-check-line text-green-500 mr-2"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-green-500 hover:text-green-700">
                <i class="ri-close-line"></i>
            </button>
        </div>
    `;
    document.body.appendChild(successDiv);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (successDiv && successDiv.parentNode) {
            successDiv.remove();
        }
    }, 5000);
}
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve(src);
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });
}

async function loadPDFLibraries() {
    const libraries = [
        {
            name: 'jsPDF',
            urls: [
                'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js',
                'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
            ],
            check: () => window.jspdf
        },
        {
            name: 'html2canvas',
            urls: [
                'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js',
                'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
            ],
            check: () => window.html2canvas
        }
    ];

    for (const library of libraries) {
        if (library.check()) {
            console.log(`${library.name} already loaded`);
            continue;
        }

        let loaded = false;
        for (const url of library.urls) {
            try {
                await loadScript(url);
                if (library.check()) {
                    console.log(`${library.name} loaded from ${url}`);
                    loaded = true;
                    break;
                }
            } catch (error) {
                console.warn(`Failed to load ${library.name} from ${url}:`, error.message);
            }
        }

        if (!loaded) {
            throw new Error(`Failed to load ${library.name} from all CDN sources`);
        }
    }

    return true;
}

function ensureLibrariesLoaded() {
    return new Promise(async (resolve, reject) => {
        try {
            // First check if libraries are already available
            if (window.jspdf && window.html2canvas) {
                console.log('PDF libraries already available');
                resolve(true);
                return;
            }

            console.log('Loading PDF libraries dynamically...');
            await loadPDFLibraries();
            
            // Final verification
            if (window.jspdf && window.html2canvas) {
                console.log('PDF libraries loaded successfully');
                resolve(true);
            } else {
                throw new Error('Libraries loaded but not accessible');
            }
        } catch (error) {
            console.error('Failed to load PDF libraries:', error);
            reject(error);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize PDF libraries first
    ensureLibrariesLoaded()
        .then(() => {
            console.log('PDF libraries ready for use');
            // Now initialize Firebase and ReportsManager
            const initializeReportsManager = () => {
                if (window.collections && window.collections.reports && window.auth && window.db) {
                    console.log('Firebase initialized successfully, creating ReportsManager');
                    reportsManager = new ReportsManager();
                } else {
                    console.log('Waiting for Firebase initialization...');
                    // Retry after a short delay
                    setTimeout(initializeReportsManager, 100);
                }
            };
            
            initializeReportsManager();
        })
        .catch(error => {
            console.error('Failed to load PDF libraries:', error);
            // Show user-friendly error message
            showError('PDF generation features are currently unavailable. Please refresh the page to try again.');
            
            // Still initialize Firebase and ReportsManager for other functionality
            const initializeReportsManager = () => {
                if (window.collections && window.collections.reports && window.auth && window.db) {
                    console.log('Firebase initialized successfully, creating ReportsManager (without PDF support)');
                    reportsManager = new ReportsManager();
                } else {
                    console.log('Waiting for Firebase initialization...');
                    setTimeout(initializeReportsManager, 100);
                }
            };
            
            initializeReportsManager();
        });
});