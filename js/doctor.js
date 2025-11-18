class DoctorManager {
    constructor() {
        this.patients = [];
        this.filteredPatients = [];
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.listeners = [];
        this.currentUser = null;
        
        // Store references to Firebase objects
        this.collections = window.collections;
        this.auth = window.auth;
        this.db = window.db;
        
        this.init();
    }

    async init() {
        await this.checkAuth();
        await this.loadDepartments();
        this.setupEventListeners();
        this.setupRealtimeListeners();
        await this.loadPatientStatistics();
    }

    async checkAuth() {
        return new Promise((resolve) => {
            window.auth.onAuthStateChanged(user => {
                if (user) {
                    this.currentUser = user;
                    document.getElementById('doctorName').textContent = user.displayName || 'Doctor';
                    resolve(user);
                } else {
                    window.location.href = 'index.html';
                }
            });
        });
    }

    setupEventListeners() {
        // Search and filters
        document.getElementById('patientSearch').addEventListener('input', () => this.filterPatients());
        document.getElementById('departmentFilter').addEventListener('change', () => this.filterPatients());
        document.getElementById('priorityFilter').addEventListener('change', () => this.filterPatients());

        // Form submissions
        document.getElementById('prescriptionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.savePrescription();
        });

        document.getElementById('healthRecordsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateHealthRecords();
        });

        // Set current time for medication form
        const now = new Date();
        const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        const medicationTimeInput = document.getElementById('medicationTime');
        if (medicationTimeInput) {
            medicationTimeInput.value = localDateTime;
        }
    }

    setupRealtimeListeners() {
        // Listen to patients collection
        this.listeners.push(
            window.collections.patients
                .where('status', '==', 'active')
                .orderBy('admittedAt', 'desc')
                .onSnapshot(snapshot => {
                    this.patients = [];
                    snapshot.forEach(doc => {
                        this.patients.push({ id: doc.id, ...doc.data() });
                    });
                    this.filterPatients();
                    this.updateStatistics();
                })
        );
    }

    async loadDepartments() {
        const select = document.getElementById('departmentFilter');
        if (!select) return;
        
        select.innerHTML = '<option value="">All Departments</option>';
        
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

    filterPatients() {
        const searchTerm = document.getElementById('patientSearch').value.toLowerCase();
        const departmentFilter = document.getElementById('departmentFilter').value;
        const priorityFilter = document.getElementById('priorityFilter').value;

        this.filteredPatients = this.patients.filter(patient => {
            // Search filter
            if (searchTerm) {
                const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
                const patientId = patient.patientId?.toLowerCase() || '';
                const condition = patient.chiefComplaint?.toLowerCase() || '';
                if (!fullName.includes(searchTerm) && 
                    !patientId.includes(searchTerm) && 
                    !condition.includes(searchTerm)) {
                    return false;
                }
            }

            // Department filter
            if (departmentFilter && patient.department !== departmentFilter) {
                return false;
            }

            // Priority filter
            if (priorityFilter && patient.priority !== priorityFilter) {
                return false;
            }

            return true;
        });

        this.currentPage = 1;
        this.renderPatientTable();
    }

    renderPatientTable() {
        const tbody = document.getElementById('patientTableBody');
        if (!tbody) return;

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedPatients = this.filteredPatients.slice(startIndex, endIndex);

        tbody.innerHTML = '';

        if (paginatedPatients.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-8 text-center text-gray-500">
                        No patients found
                    </td>
                </tr>
            `;
            return;
        }

        paginatedPatients.forEach(patient => {
            const age = this.calculateAge(patient.dateOfBirth);
            const lastVisit = patient.admittedAt ? 
                new Date(patient.admittedAt.toDate()).toLocaleDateString() : 'N/A';

            const priorityColors = {
                critical: 'bg-red-100 text-red-800',
                high: 'bg-orange-100 text-orange-800',
                medium: 'bg-yellow-100 text-yellow-800',
                low: 'bg-green-100 text-green-800'
            };

            tbody.innerHTML += `
                <tr class="hover:bg-gray-50 transition">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                                <i class="ri-user-3-line text-gray-600"></i>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900">${patient.firstName} ${patient.lastName}</p>
                                <p class="text-sm text-gray-500">#${patient.patientId || patient.id.substring(0, 8)}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${age}y / ${patient.gender}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${patient.departmentName || 'Unassigned'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${patient.chiefComplaint || 'Not specified'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColors[patient.priority] || 'bg-gray-100 text-gray-800'}">
                            ${patient.priority?.toUpperCase() || 'NORMAL'}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${lastVisit}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div class="flex space-x-2">
                            <button onclick="viewPatientDetails('${patient.id}')" 
                                class="text-blue-600 hover:text-blue-900" title="View Details">
                                <i class="ri-eye-line"></i>
                            </button>
                            <button onclick="openPrescriptionModal('${patient.id}')" 
                                class="text-green-600 hover:text-green-900" title="Add Prescription">
                                <i class="ri-medicine-bottle-line"></i>
                            </button>
                            <button onclick="openHealthRecordsModal('${patient.id}')" 
                                class="text-purple-600 hover:text-purple-900" title="Update Health Records">
                                <i class="ri-heart-pulse-line"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        this.updatePagination();
    }

    calculateAge(dateOfBirth) {
        if (!dateOfBirth) return 'N/A';
        const dob = dateOfBirth.toDate ? dateOfBirth.toDate() : new Date(dateOfBirth);
        const ageDiff = Date.now() - dob.getTime();
        const ageDate = new Date(ageDiff);
        return Math.abs(ageDate.getUTCFullYear() - 1970);
    }

    updatePagination() {
        const showingStart = document.getElementById('showingStart');
        const showingEnd = document.getElementById('showingEnd');
        const totalRecords = document.getElementById('totalRecords');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');

        if (showingStart) showingStart.textContent = 
            Math.min((this.currentPage - 1) * this.itemsPerPage + 1, this.filteredPatients.length);
        if (showingEnd) showingEnd.textContent = 
            Math.min(this.currentPage * this.itemsPerPage, this.filteredPatients.length);
        if (totalRecords) totalRecords.textContent = this.filteredPatients.length;

        if (prevBtn) prevBtn.disabled = this.currentPage === 1;
        if (nextBtn) nextBtn.disabled = 
            this.currentPage * this.itemsPerPage >= this.filteredPatients.length;
    }

    updateStatistics() {
        const stats = {
            total: this.patients.length,
            prescriptionsToday: 0,
            critical: 0,
            aiConsultations: 0
        };

        // Count critical patients
        stats.critical = this.patients.filter(p => p.priority === 'critical').length;

        // Update UI
        document.getElementById('totalPatients').textContent = stats.total;
        document.getElementById('prescriptionsToday').textContent = stats.prescriptionsToday;
        document.getElementById('criticalPatients').textContent = stats.critical;
        document.getElementById('aiConsultations').textContent = stats.aiConsultations;
    }

    async loadPatientStatistics() {
        try {
            // Load today's prescriptions count
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            if (window.collections && window.collections.prescriptions) {
                const prescriptionsSnapshot = await window.collections.prescriptions
                    .where('prescribedBy', '==', this.currentUser?.uid || '')
                    .where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(today))
                    .where('createdAt', '<', firebase.firestore.Timestamp.fromDate(tomorrow))
                    .get();

                document.getElementById('prescriptionsToday').textContent = prescriptionsSnapshot.size;
            }

            // Load AI consultations count (from localStorage for session persistence)
            const aiConsultations = localStorage.getItem('aiConsultations') || '0';
            document.getElementById('aiConsultations').textContent = aiConsultations;

        } catch (error) {
            console.error('Error loading patient statistics:', error);
            // Set default values on error
            document.getElementById('prescriptionsToday').textContent = '0';
            document.getElementById('aiConsultations').textContent = '0';
        }
    }

    async viewPatientDetails(patientId) {
        const modal = document.getElementById('patientDetailsModal');
        const content = document.getElementById('patientDetailsContent');

        try {
            const patientDoc = await window.collections.patients.doc(patientId).get();
            if (!patientDoc.exists) {
                this.showNotification('Patient not found', 'error');
                return;
            }

            const patient = { id: patientDoc.id, ...patientDoc.data() };
            const age = this.calculateAge(patient.dateOfBirth);

            // Get recent prescriptions
            const prescriptionsSnapshot = await window.collections.prescriptions
                .where('patientId', '==', patientId)
                .orderBy('createdAt', 'desc')
                .limit(5)
                .get();

            const prescriptions = [];
            prescriptionsSnapshot.forEach(doc => {
                prescriptions.push({ id: doc.id, ...doc.data() });
            });

            // Get recent vitals
            const vitalsSnapshot = await window.collections.vitals
                .where('patientId', '==', patientId)
                .orderBy('recordedAt', 'desc')
                .limit(3)
                .get();

            const vitals = [];
            vitalsSnapshot.forEach(doc => {
                vitals.push({ id: doc.id, ...doc.data() });
            });

            content.innerHTML = `
                <div class="space-y-6">
                    <!-- Patient Header -->
                    <div class="bg-blue-50 rounded-lg p-6">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-4">
                                <div class="w-16 h-16 bg-blue-200 rounded-full flex items-center justify-center">
                                    <i class="ri-user-3-line text-blue-700 text-2xl"></i>
                                </div>
                                <div>
                                    <h4 class="text-xl font-semibold text-blue-900">
                                        ${patient.firstName} ${patient.lastName}
                                    </h4>
                                    <p class="text-blue-700">Patient ID: ${patient.patientId}</p>
                                    <p class="text-sm text-blue-600">${age} years • ${patient.gender} • ${patient.departmentName}</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${this.getPriorityColor(patient.priority)}">
                                    ${patient.priority?.toUpperCase()}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Patient Info Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Medical Information -->
                        <div class="bg-white border rounded-lg p-4">
                            <h5 class="font-semibold text-gray-800 mb-3">Medical Information</h5>
                            <div class="space-y-3">
                                <div>
                                    <label class="text-sm font-medium text-gray-600">Chief Complaint</label>
                                    <p class="text-gray-900">${patient.chiefComplaint || 'Not specified'}</p>
                                </div>
                                <div>
                                    <label class="text-sm font-medium text-gray-600">Medical History</label>
                                    <p class="text-gray-900">${patient.medicalHistory || 'No history available'}</p>
                                </div>
                                <div>
                                    <label class="text-sm font-medium text-gray-600">Allergies</label>
                                    <p class="text-gray-900">${patient.allergies?.join(', ') || 'None known'}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Contact Information -->
                        <div class="bg-white border rounded-lg p-4">
                            <h5 class="font-semibold text-gray-800 mb-3">Contact Information</h5>
                            <div class="space-y-3">
                                <div>
                                    <label class="text-sm font-medium text-gray-600">Phone Number</label>
                                    <p class="text-gray-900">${patient.contactNumber || 'Not provided'}</p>
                                </div>
                                <div>
                                    <label class="text-sm font-medium text-gray-600">Emergency Contact</label>
                                    <p class="text-gray-900">${patient.emergencyContact || 'Not provided'}</p>
                                </div>
                                <div>
                                    <label class="text-sm font-medium text-gray-600">Admitted</label>
                                    <p class="text-gray-900">${patient.admittedAt ? 
                                        new Date(patient.admittedAt.toDate()).toLocaleString() : 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Recent Prescriptions -->
                    <div class="bg-white border rounded-lg p-4">
                        <h5 class="font-semibold text-gray-800 mb-3">Recent Prescriptions</h5>
                        ${prescriptions.length > 0 ? `
                            <div class="space-y-3">
                                ${prescriptions.map(prescription => `
                                    <div class="border-l-4 border-green-400 bg-green-50 p-3">
                                        <div class="flex justify-between items-start">
                                            <div>
                                                <p class="font-medium text-green-800">${prescription.diagnosis}</p>
                                                <p class="text-sm text-green-600">
                                                    ${prescription.createdAt ? 
                                                        new Date(prescription.createdAt.toDate()).toLocaleDateString() : 'Unknown date'}
                                                </p>
                                            </div>
                                        </div>
                                        ${prescription.medications?.length > 0 ? `
                                            <div class="mt-2">
                                                <p class="text-sm font-medium text-green-700">Medications:</p>
                                                <ul class="text-sm text-green-600 mt-1">
                                                    ${prescription.medications.map(med => 
                                                        `<li>• ${med.name} - ${med.dosage} (${med.frequency})</li>`
                                                    ).join('')}
                                                </ul>
                                            </div>
                                        ` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<p class="text-gray-500 text-center py-4">No prescriptions found</p>'}
                    </div>

                    <!-- Recent Vitals -->
                    <div class="bg-white border rounded-lg p-4">
                        <h5 class="font-semibold text-gray-800 mb-3">Recent Vital Signs</h5>
                        ${vitals.length > 0 ? `
                            <div class="space-y-3">
                                ${vitals.map(vital => `
                                    <div class="bg-blue-50 rounded p-3">
                                        <div class="flex justify-between items-center mb-2">
                                            <span class="text-sm font-medium text-blue-700">
                                                ${vital.recordedAt ? 
                                                    new Date(vital.recordedAt.toDate()).toLocaleString() : 'Unknown time'}
                                            </span>
                                        </div>
                                        <div class="grid grid-cols-5 gap-4 text-sm">
                                            <div>
                                                <span class="text-blue-600">BP:</span>
                                                <span class="ml-1 font-medium">${vital.vitals?.bloodPressure || 'N/A'}</span>
                                            </div>
                                            <div>
                                                <span class="text-blue-600">HR:</span>
                                                <span class="ml-1 font-medium">${vital.vitals?.heartRate || 'N/A'}</span>
                                            </div>
                                            <div>
                                                <span class="text-blue-600">Temp:</span>
                                                <span class="ml-1 font-medium">${vital.vitals?.temperature || 'N/A'}°C</span>
                                            </div>
                                            <div>
                                                <span class="text-blue-600">O₂:</span>
                                                <span class="ml-1 font-medium">${vital.vitals?.oxygenSaturation || 'N/A'}%</span>
                                            </div>
                                            <div>
                                                <span class="text-blue-600">RR:</span>
                                                <span class="ml-1 font-medium">${vital.vitals?.respiratoryRate || 'N/A'}/min</span>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<p class="text-gray-500 text-center py-4">No vital signs recorded</p>'}
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-end space-x-3 pt-4 border-t">
                        <button onclick="openPrescriptionModal('${patient.id}')" 
                            class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                            <i class="ri-medicine-bottle-line mr-2"></i>Add Prescription
                        </button>
                        <button onclick="openHealthRecordsModal('${patient.id}')" 
                            class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                            <i class="ri-heart-pulse-line mr-2"></i>Update Records
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

    getPriorityColor(priority) {
        const colors = {
            'critical': 'bg-red-100 text-red-800',
            'high': 'bg-orange-100 text-orange-800',
            'medium': 'bg-yellow-100 text-yellow-800',
            'low': 'bg-green-100 text-green-800'
        };
        return colors[priority] || 'bg-gray-100 text-gray-800';
    }

    async openPrescriptionModal(patientId) {
        const modal = document.getElementById('prescriptionModal');
        
        try {
            const patientDoc = await window.collections.patients.doc(patientId).get();
            if (!patientDoc.exists) {
                this.showNotification('Patient not found', 'error');
                return;
            }

            const patient = patientDoc.data();
            const age = this.calculateAge(patient.dateOfBirth);

            // Fill patient info
            document.getElementById('prescriptionPatientId').value = patientId;
            document.getElementById('prescriptionPatientName').textContent = 
                `${patient.firstName} ${patient.lastName}`;
            document.getElementById('prescriptionPatientInfo').textContent = 
                `${age} years • ${patient.gender} • ${patient.departmentName}`;

            // Clear previous medications
            document.getElementById('medicationsContainer').innerHTML = '';
            this.addMedication(); // Add one empty medication row

            modal.classList.remove('hidden');

        } catch (error) {
            console.error('Error opening prescription modal:', error);
            this.showNotification('Error opening prescription form', 'error');
        }
    }

    addMedication() {
        const container = document.getElementById('medicationsContainer');
        const medicationIndex = container.children.length;

        const medicationDiv = document.createElement('div');
        medicationDiv.className = 'medication-item border border-gray-200 rounded-lg p-4 space-y-3';
        medicationDiv.innerHTML = `
            <div class="flex justify-between items-center">
                <h5 class="font-medium text-gray-800">Medication ${medicationIndex + 1}</h5>
                <button type="button" onclick="removeMedication(this)" 
                    class="text-red-500 hover:text-red-700 ${medicationIndex === 0 ? 'hidden' : ''}">
                    <i class="ri-delete-bin-line"></i>
                </button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Medication Name</label>
                    <input type="text" name="medicationName" required
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Paracetamol">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Dosage</label>
                    <input type="text" name="medicationDosage" required
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., 500mg">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                    <select name="medicationFrequency" required
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Select frequency</option>
                        <option value="Once daily">Once daily</option>
                        <option value="Twice daily">Twice daily</option>
                        <option value="Three times daily">Three times daily</option>
                        <option value="Four times daily">Four times daily</option>
                        <option value="Every 4 hours">Every 4 hours</option>
                        <option value="Every 6 hours">Every 6 hours</option>
                        <option value="Every 8 hours">Every 8 hours</option>
                        <option value="As needed">As needed</option>
                    </select>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                    <input type="text" name="medicationDuration"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., 7 days">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Route</label>
                    <select name="medicationRoute" required
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Select route</option>
                        <option value="Oral">Oral</option>
                        <option value="Intravenous">Intravenous</option>
                        <option value="Intramuscular">Intramuscular</option>
                        <option value="Subcutaneous">Subcutaneous</option>
                        <option value="Topical">Topical</option>
                        <option value="Inhalation">Inhalation</option>
                    </select>
                </div>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
                <input type="text" name="medicationInstructions"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Take with food, Before meals">
            </div>
        `;

        container.appendChild(medicationDiv);
    }

    removeMedication(button) {
        const medicationItem = button.closest('.medication-item');
        medicationItem.remove();

        // Update medication numbers
        const container = document.getElementById('medicationsContainer');
        const medications = container.querySelectorAll('.medication-item');
        medications.forEach((item, index) => {
            const title = item.querySelector('h5');
            title.textContent = `Medication ${index + 1}`;
            
            // Hide remove button for first medication
            const removeBtn = item.querySelector('button[onclick*="removeMedication"]');
            if (index === 0) {
                removeBtn.classList.add('hidden');
            } else {
                removeBtn.classList.remove('hidden');
            }
        });
    }

    async getAIRecommendations() {
        const aiContainer = document.getElementById('aiRecommendations');
        const patientId = document.getElementById('prescriptionPatientId').value;
        const diagnosis = document.getElementById('diagnosis').value;

        if (!diagnosis.trim()) {
            this.showNotification('Please enter a diagnosis first to get AI recommendations', 'warning');
            return;
        }

        try {
            aiContainer.innerHTML = `
                <div class="flex items-center space-x-2">
                    <i class="ri-loader-4-line animate-spin text-purple-600"></i>
                    <span class="text-purple-700">Getting AI recommendations...</span>
                </div>
            `;

            // Get patient data for context
            const patientDoc = await window.collections.patients.doc(patientId).get();
            const patient = patientDoc.data();

            // Prepare context for AI
            const context = {
                patientAge: this.calculateAge(patient.dateOfBirth),
                gender: patient.gender,
                diagnosis: diagnosis,
                medicalHistory: patient.medicalHistory || '',
                allergies: patient.allergies || [],
                chiefComplaint: patient.chiefComplaint || ''
            };

            // Call Gemini AI API
            const recommendations = await this.callGeminiAPI(context);
            
            aiContainer.innerHTML = `
                <div class="space-y-3">
                    <div class="flex items-center space-x-2 text-purple-700">
                        <i class="ri-robot-line"></i>
                        <span class="font-medium">AI Recommendations:</span>
                    </div>
                    <div class="bg-white rounded border p-3 text-sm">
                        ${recommendations.replace(/\n/g, '<br>')}
                    </div>
                    <p class="text-xs text-purple-600">
                        <i class="ri-information-line mr-1"></i>
                        AI recommendations are suggestions only. Always use clinical judgment.
                    </p>
                </div>
            `;

            // Update AI consultation count and persist it
            const currentCount = parseInt(document.getElementById('aiConsultations').textContent);
            const newCount = currentCount + 1;
            document.getElementById('aiConsultations').textContent = newCount;
            localStorage.setItem('aiConsultations', newCount.toString());

        } catch (error) {
            console.error('Error getting AI recommendations:', error);
            aiContainer.innerHTML = `
                <div class="text-red-600">
                    <i class="ri-error-warning-line mr-1"></i>
                    Unable to get AI recommendations. Please try again later.
                </div>
            `;
        }
    }

    async callGeminiAPI(context) {
        // Use the real Gemini AI service if configured
        if (window.geminiAI && window.geminiAI.isConfigured()) {
            console.log('🤖 Using real Gemini AI for medical recommendations');
            return await window.geminiAI.getMedicalRecommendations(context);
        }
        
        // Fallback if Gemini AI not loaded
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(`Based on the diagnosis of "${context.diagnosis}" for a ${context.patientAge}-year-old ${context.gender}:

**Recommended Treatment:**
• Primary medication: Consider standard first-line therapy
• Dosage: Age-appropriate dosing
• Duration: Typical course length for this condition

**Important Considerations:**
• Monitor for common side effects
• Consider patient's age and gender in dosing
• Review drug interactions with current medications

**Follow-up:**
• Schedule follow-up in 1-2 weeks
• Monitor treatment response
• Adjust therapy as needed

*Note: These are AI-generated suggestions. Please verify with current clinical guidelines and use your professional judgment.*`);
            }, 2000);
        });
    }

    async savePrescription() {
        const form = document.getElementById('prescriptionForm');
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Saving...';

            const patientId = document.getElementById('prescriptionPatientId').value;
            const diagnosis = document.getElementById('diagnosis').value;
            const instructions = document.getElementById('instructions').value;
            const followUpRequired = document.getElementById('followUpRequired').value === 'true';
            const followUpDate = document.getElementById('followUpDate').value;

            // Collect medications
            const medications = [];
            const medicationItems = document.querySelectorAll('.medication-item');
            
            medicationItems.forEach(item => {
                const name = item.querySelector('input[name="medicationName"]').value;
                const dosage = item.querySelector('input[name="medicationDosage"]').value;
                const frequency = item.querySelector('select[name="medicationFrequency"]').value;
                const duration = item.querySelector('input[name="medicationDuration"]').value;
                const route = item.querySelector('select[name="medicationRoute"]').value;
                const specialInstructions = item.querySelector('input[name="medicationInstructions"]').value;

                if (name && dosage && frequency && route) {
                    medications.push({
                        name,
                        dosage,
                        frequency,
                        duration,
                        route,
                        specialInstructions
                    });
                }
            });

            if (medications.length === 0) {
                this.showNotification('Please add at least one medication', 'warning');
                return;
            }

            const prescriptionData = {
                patientId,
                diagnosis,
                medications,
                instructions,
                followUpRequired,
                followUpDate: followUpDate ? firebase.firestore.Timestamp.fromDate(new Date(followUpDate)) : null,
                prescribedBy: this.currentUser.uid,
                prescribedByName: this.currentUser.displayName || 'Doctor',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            };

            // Ensure collections exist before using
            if (!window.collections || !window.collections.prescriptions) {
                throw new Error('Prescriptions collection not available. Please check Firebase configuration.');
            }

            await window.collections.prescriptions.add(prescriptionData);

            // Update patient record
            await window.collections.patients.doc(patientId).update({
                lastPrescription: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.showNotification('Prescription saved successfully!', 'success');
            this.closePrescriptionModal();

            // Update prescription count
            const currentCount = parseInt(document.getElementById('prescriptionsToday').textContent);
            document.getElementById('prescriptionsToday').textContent = currentCount + 1;

        } catch (error) {
            console.error('Error saving prescription:', error);
            this.showNotification('Error saving prescription. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="ri-save-line mr-2"></i>Save Prescription';
        }
    }

    async openHealthRecordsModal(patientId) {
        const modal = document.getElementById('healthRecordsModal');
        
        try {
            const patientDoc = await window.collections.patients.doc(patientId).get();
            if (!patientDoc.exists) {
                this.showNotification('Patient not found', 'error');
                return;
            }

            const patient = patientDoc.data();
            const age = this.calculateAge(patient.dateOfBirth);

            // Fill patient info
            document.getElementById('healthRecordsPatientId').value = patientId;
            document.getElementById('healthRecordsPatientName').textContent = 
                `${patient.firstName} ${patient.lastName}`;
            document.getElementById('healthRecordsPatientInfo').textContent = 
                `${age} years • ${patient.gender} • ${patient.departmentName}`;

            // Get latest vitals to pre-fill form
            const vitalsSnapshot = await window.collections.vitals
                .where('patientId', '==', patientId)
                .orderBy('recordedAt', 'desc')
                .limit(1)
                .get();

            if (!vitalsSnapshot.empty) {
                const latestVitals = vitalsSnapshot.docs[0].data();
                if (latestVitals.vitals) {
                    document.getElementById('bloodPressure').value = latestVitals.vitals.bloodPressure || '';
                    document.getElementById('heartRate').value = latestVitals.vitals.heartRate || '';
                    document.getElementById('temperature').value = latestVitals.vitals.temperature || '';
                    document.getElementById('oxygenSaturation').value = latestVitals.vitals.oxygenSaturation || '';
                    document.getElementById('respiratoryRate').value = latestVitals.vitals.respiratoryRate || '';
                }
            }

            modal.classList.remove('hidden');

        } catch (error) {
            console.error('Error opening health records modal:', error);
            this.showNotification('Error opening health records form', 'error');
        }
    }

    async updateHealthRecords() {
        const form = document.getElementById('healthRecordsForm');
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Updating...';

            const patientId = document.getElementById('healthRecordsPatientId').value;
            
            const vitalsData = {
                bloodPressure: document.getElementById('bloodPressure').value,
                heartRate: document.getElementById('heartRate').value,
                temperature: document.getElementById('temperature').value,
                oxygenSaturation: document.getElementById('oxygenSaturation').value,
                respiratoryRate: document.getElementById('respiratoryRate').value
            };

            const clinicalNotes = document.getElementById('clinicalNotes').value;
            const treatmentNotes = document.getElementById('treatmentNotes').value;

            // Save vitals if any are provided
            const hasVitals = Object.values(vitalsData).some(value => value.trim());
            if (hasVitals) {
                await window.collections.vitals.add({
                    patientId,
                    vitals: vitalsData,
                    recordedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    recordedBy: this.currentUser.uid,
                    recordedByName: this.currentUser.displayName || 'Doctor',
                    recordedByType: 'doctor'
                });
            }

            // Save clinical notes
            if (clinicalNotes.trim() || treatmentNotes.trim()) {
                await window.collections.clinicalNotes.add({
                    patientId,
                    clinicalNotes,
                    treatmentNotes,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: this.currentUser.uid,
                    createdByName: this.currentUser.displayName || 'Doctor',
                    createdByType: 'doctor'
                });
            }

            // Update patient record
            await window.collections.patients.doc(patientId).update({
                lastExamination: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.showNotification('Health records updated successfully!', 'success');
            this.closeHealthRecordsModal();

        } catch (error) {
            console.error('Error updating health records:', error);
            this.showNotification('Error updating health records. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="ri-save-line mr-2"></i>Update Records';
        }
    }

    closePrescriptionModal() {
        document.getElementById('prescriptionModal').classList.add('hidden');
        document.getElementById('prescriptionForm').reset();
        document.getElementById('medicationsContainer').innerHTML = '';
        document.getElementById('aiRecommendations').innerHTML = 
            'Click "Get AI Suggestions" to receive Gemini AI recommendations based on patient data.';
    }

    closeHealthRecordsModal() {
        document.getElementById('healthRecordsModal').classList.add('hidden');
        document.getElementById('healthRecordsForm').reset();
    }

    closePatientDetailsModal() {
        document.getElementById('patientDetailsModal').classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transition-all duration-300 transform translate-x-full ${
            type === 'success' ? 'bg-green-500 text-white' :
            type === 'error' ? 'bg-red-500 text-white' :
            type === 'warning' ? 'bg-yellow-500 text-white' :
            'bg-blue-500 text-white'
        }`;
        notification.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="ri-${type === 'success' ? 'check' : type === 'error' ? 'close' : type === 'warning' ? 'alert' : 'information'}-line"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 100);

        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    cleanup() {
        this.listeners.forEach(unsubscribe => unsubscribe());
    }
}

// Global functions
function viewPatientDetails(patientId) {
    if (window.doctorManager) {
        window.doctorManager.viewPatientDetails(patientId);
    }
}

function openPrescriptionModal(patientId) {
    if (window.doctorManager) {
        window.doctorManager.openPrescriptionModal(patientId);
    }
}

function openHealthRecordsModal(patientId) {
    if (window.doctorManager) {
        window.doctorManager.openHealthRecordsModal(patientId);
    }
}

function closePrescriptionModal() {
    if (window.doctorManager) {
        window.doctorManager.closePrescriptionModal();
    }
}

function closeHealthRecordsModal() {
    if (window.doctorManager) {
        window.doctorManager.closeHealthRecordsModal();
    }
}

function closePatientDetailsModal() {
    if (window.doctorManager) {
        window.doctorManager.closePatientDetailsModal();
    }
}

function addMedication() {
    if (window.doctorManager) {
        window.doctorManager.addMedication();
    }
}

function removeMedication(button) {
    if (window.doctorManager) {
        window.doctorManager.removeMedication(button);
    }
}

function getAIRecommendations() {
    if (window.doctorManager) {
        window.doctorManager.getAIRecommendations();
    }
}

function previousPage() {
    if (window.doctorManager && window.doctorManager.currentPage > 1) {
        window.doctorManager.currentPage--;
        window.doctorManager.renderPatientTable();
    }
}

function nextPage() {
    if (window.doctorManager) {
        const maxPage = Math.ceil(window.doctorManager.filteredPatients.length / window.doctorManager.itemsPerPage);
        if (window.doctorManager.currentPage < maxPage) {
            window.doctorManager.currentPage++;
            window.doctorManager.renderPatientTable();
        }
    }
}

function signOut() {
    window.auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
}

// Initialize Doctor Manager
let doctorManager;
document.addEventListener('DOMContentLoaded', () => {
    const initializeDoctorManager = () => {
        if (window.collections && window.collections.patients && window.auth && window.db) {
            console.log('Firebase initialized successfully, creating DoctorManager');
            doctorManager = new DoctorManager();
            window.doctorManager = doctorManager;
        } else {
            console.log('Waiting for Firebase initialization...');
            setTimeout(initializeDoctorManager, 100);
        }
    };
    
    initializeDoctorManager();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (doctorManager) {
        doctorManager.cleanup();
    }
});
