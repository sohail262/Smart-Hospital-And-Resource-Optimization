class NurseManager {
    constructor() {
        this.patients = [];
        this.filteredPatients = [];
        this.currentPage = 1;
        this.itemsPerPage = 9; // Using 9 for 3x3 grid
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
        await this.loadWards();
        this.setupEventListeners();
        this.setupRealtimeListeners();
        await this.loadNursingStatistics();
    }

    async checkAuth() {
        return new Promise((resolve) => {
            window.auth.onAuthStateChanged(user => {
                if (user) {
                    this.currentUser = user;
                    document.getElementById('nurseName').textContent = user.displayName || 'Nurse';
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
        document.getElementById('wardFilter').addEventListener('change', () => this.filterPatients());
        document.getElementById('statusFilter').addEventListener('change', () => this.filterPatients());

        // Form submissions
        document.getElementById('recordVitalsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.recordVitals();
        });

        document.getElementById('medicationLogForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.logMedication();
        });

        document.getElementById('careNotesForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveCareNotes();
        });

        // Set current time for medication log
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
                    this.populatePatientSelects();
                })
        );
    }

    async loadWards() {
        const select = document.getElementById('wardFilter');
        if (!select) return;
        
        select.innerHTML = '<option value="">All Wards</option>';
        
        try {
            const snapshot = await window.collections.departments.get();
            snapshot.forEach(doc => {
                const dept = doc.data();
                select.innerHTML += `<option value="${doc.id}">${dept.name}</option>`;
            });
        } catch (error) {
            console.error('Error loading wards:', error);
        }
    }

    populatePatientSelects() {
        const selects = [
            'vitalsPatientSelect',
            'medPatientSelect',
            'careNotesPatientSelect'
        ];

        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;

            const currentValue = select.value;
            select.innerHTML = '<option value="">Choose a patient...</option>';
            
            this.patients.forEach(patient => {
                select.innerHTML += `
                    <option value="${patient.id}">
                        ${patient.firstName} ${patient.lastName} - ${patient.patientId || patient.id.substring(0, 8)}
                    </option>
                `;
            });

            // Restore previous selection if it still exists
            if (currentValue) {
                select.value = currentValue;
            }
        });
    }

    filterPatients() {
        const searchTerm = document.getElementById('patientSearch').value.toLowerCase();
        const wardFilter = document.getElementById('wardFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;

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

            // Ward filter
            if (wardFilter && patient.department !== wardFilter) {
                return false;
            }

            // Status filter
            if (statusFilter) {
                if (statusFilter === 'critical' && patient.priority !== 'critical') {
                    return false;
                }
                if (statusFilter === 'stable' && patient.priority === 'critical') {
                    return false;
                }
            }

            return true;
        });

        this.currentPage = 1;
        this.renderPatientCards();
    }

    renderPatientCards() {
        const container = document.getElementById('patientCards');
        if (!container) return;

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedPatients = this.filteredPatients.slice(startIndex, endIndex);

        container.innerHTML = '';

        if (paginatedPatients.length === 0) {
            container.innerHTML = `
                <div class="col-span-3 text-center py-12 text-gray-500">
                    <i class="ri-user-heart-line text-4xl mb-4"></i>
                    <p>No patients found</p>
                </div>
            `;
            return;
        }

        paginatedPatients.forEach(patient => {
            const age = this.calculateAge(patient.dateOfBirth);
            const admittedDays = this.calculateDaysAdmitted(patient.admittedAt);

            const priorityColors = {
                critical: 'border-red-500 bg-red-50',
                high: 'border-orange-500 bg-orange-50',
                medium: 'border-yellow-500 bg-yellow-50',
                low: 'border-green-500 bg-green-50'
            };

            const priorityIcons = {
                critical: 'ri-alarm-warning-line text-red-600',
                high: 'ri-error-warning-line text-orange-600',
                medium: 'ri-information-line text-yellow-600',
                low: 'ri-checkbox-circle-line text-green-600'
            };

            container.innerHTML += `
                <div class="bg-white rounded-lg shadow-sm border-l-4 ${priorityColors[patient.priority] || 'border-gray-300 bg-gray-50'} p-6 hover:shadow-md transition">
                    <!-- Patient Header -->
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center space-x-3">
                            <div class="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center">
                                <i class="ri-user-heart-line text-pink-600 text-xl"></i>
                            </div>
                            <div>
                                <h4 class="font-semibold text-gray-900">${patient.firstName} ${patient.lastName}</h4>
                                <p class="text-sm text-gray-500">#${patient.patientId || patient.id.substring(0, 8)}</p>
                            </div>
                        </div>
                        <i class="${priorityIcons[patient.priority] || 'ri-information-line text-gray-400'} text-xl"></i>
                    </div>

                    <!-- Patient Info -->
                    <div class="space-y-2 mb-4">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600">Age/Gender:</span>
                            <span class="font-medium">${age}y / ${patient.gender}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600">Ward:</span>
                            <span class="font-medium">${patient.departmentName || 'Unassigned'}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600">Admitted:</span>
                            <span class="font-medium">${admittedDays} days ago</span>
                        </div>
                        <div class="text-sm">
                            <span class="text-gray-600">Condition:</span>
                            <p class="font-medium mt-1 text-gray-900">${patient.chiefComplaint || 'Not specified'}</p>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex space-x-2">
                        <button onclick="viewPatientCareDetails('${patient.id}')" 
                            class="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition text-sm font-medium">
                            <i class="ri-eye-line mr-1"></i>Details
                        </button>
                        <button onclick="quickRecordVitals('${patient.id}')" 
                            class="flex-1 px-3 py-2 bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 transition text-sm font-medium">
                            <i class="ri-heart-pulse-line mr-1"></i>Vitals
                        </button>
                    </div>
                </div>
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

    calculateDaysAdmitted(admittedAt) {
        if (!admittedAt) return 0;
        const admitted = admittedAt.toDate ? admittedAt.toDate() : new Date(admittedAt);
        const now = new Date();
        const diffTime = Math.abs(now - admitted);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
            assigned: this.patients.length,
            vitalsRecorded: 0,
            criticalAlerts: 0,
            medicationsGiven: 0
        };

        // Count critical patients
        stats.criticalAlerts = this.patients.filter(p => p.priority === 'critical').length;

        // Update UI
        document.getElementById('assignedPatients').textContent = stats.assigned;
        document.getElementById('vitalsRecorded').textContent = stats.vitalsRecorded;
        document.getElementById('criticalAlerts').textContent = stats.criticalAlerts;
        document.getElementById('medicationsGiven').textContent = stats.medicationsGiven;
    }

    async loadNursingStatistics() {
        try {
            // Load today's vitals count
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            if (window.collections && window.collections.vitals) {
                const vitalsSnapshot = await window.collections.vitals
                    .where('recordedBy', '==', this.currentUser?.uid || '')
                    .where('recordedAt', '>=', firebase.firestore.Timestamp.fromDate(today))
                    .where('recordedAt', '<', firebase.firestore.Timestamp.fromDate(tomorrow))
                    .get();

                document.getElementById('vitalsRecorded').textContent = vitalsSnapshot.size;
            }

            // Load today's medications given count
            if (window.collections && window.collections.medicationLogs) {
                const medicationsSnapshot = await window.collections.medicationLogs
                    .where('administeredBy', '==', this.currentUser?.uid || '')
                    .where('administeredAt', '>=', firebase.firestore.Timestamp.fromDate(today))
                    .where('administeredAt', '<', firebase.firestore.Timestamp.fromDate(tomorrow))
                    .get();

                document.getElementById('medicationsGiven').textContent = medicationsSnapshot.size;
            }

        } catch (error) {
            console.error('Error loading nursing statistics:', error);
            // Set default values on error
            document.getElementById('vitalsRecorded').textContent = '0';
            document.getElementById('medicationsGiven').textContent = '0';
        }
    }

    openRecordVitalsModal() {
        const modal = document.getElementById('recordVitalsModal');
        document.getElementById('recordVitalsForm').reset();
        
        // Set current time
        const now = new Date();
        const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        
        modal.classList.remove('hidden');
    }

    closeRecordVitalsModal() {
        document.getElementById('recordVitalsModal').classList.add('hidden');
        document.getElementById('recordVitalsForm').reset();
    }

    async recordVitals() {
        const form = document.getElementById('recordVitalsForm');
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Recording...';

            const patientId = document.getElementById('vitalsPatientSelect').value;
            const vitalsData = {
                bloodPressure: document.getElementById('vitalsBP').value,
                heartRate: document.getElementById('vitalsHR').value,
                temperature: document.getElementById('vitalsTemp').value,
                oxygenSaturation: document.getElementById('vitalsO2').value,
                respiratoryRate: document.getElementById('vitalsRR').value,
                painLevel: document.getElementById('vitalsPain').value
            };

            const notes = document.getElementById('vitalsNotes').value;

            // Ensure collections exist before using
            if (!window.collections || !window.collections.vitals) {
                throw new Error('Vitals collection not available. Please check Firebase configuration.');
            }

            await window.collections.vitals.add({
                patientId,
                vitals: vitalsData,
                notes,
                recordedAt: firebase.firestore.FieldValue.serverTimestamp(),
                recordedBy: this.currentUser.uid,
                recordedByName: this.currentUser.displayName || 'Nurse',
                recordedByType: 'nurse'
            });

            // Update patient record
            await window.collections.patients.doc(patientId).update({
                lastVitals: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.showNotification('Vital signs recorded successfully!', 'success');
            this.closeRecordVitalsModal();

            // Update vitals count
            const currentCount = parseInt(document.getElementById('vitalsRecorded').textContent);
            document.getElementById('vitalsRecorded').textContent = currentCount + 1;

        } catch (error) {
            console.error('Error recording vitals:', error);
            this.showNotification('Error recording vital signs. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="ri-save-line mr-2"></i>Record Vitals';
        }
    }

    quickRecordVitals(patientId) {
        document.getElementById('vitalsPatientSelect').value = patientId;
        this.openRecordVitalsModal();
    }

    openMedicationLogModal() {
        const modal = document.getElementById('medicationLogModal');
        document.getElementById('medicationLogForm').reset();
        
        // Set current time
        const now = new Date();
        const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        document.getElementById('medicationTime').value = localDateTime;
        
        modal.classList.remove('hidden');
    }

    closeMedicationLogModal() {
        document.getElementById('medicationLogModal').classList.add('hidden');
        document.getElementById('medicationLogForm').reset();
    }

    async logMedication() {
        const form = document.getElementById('medicationLogForm');
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Logging...';

            const patientId = document.getElementById('medPatientSelect').value;
            const medicationData = {
                name: document.getElementById('medicationName').value,
                dosage: document.getElementById('medicationDosage').value,
                route: document.getElementById('medicationRoute').value,
                timeGiven: firebase.firestore.Timestamp.fromDate(new Date(document.getElementById('medicationTime').value)),
                notes: document.getElementById('medicationNotes').value
            };

            // Ensure collections exist before using
            if (!window.collections || !window.collections.medicationLogs) {
                throw new Error('Medication logs collection not available. Please check Firebase configuration.');
            }

            await window.collections.medicationLogs.add({
                patientId,
                medication: medicationData,
                administeredAt: firebase.firestore.FieldValue.serverTimestamp(),
                administeredBy: this.currentUser.uid,
                administeredByName: this.currentUser.displayName || 'Nurse',
                administeredByType: 'nurse'
            });

            // Update patient record
            await window.collections.patients.doc(patientId).update({
                lastMedication: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.showNotification('Medication administration logged successfully!', 'success');
            this.closeMedicationLogModal();

            // Update medication count
            const currentCount = parseInt(document.getElementById('medicationsGiven').textContent);
            document.getElementById('medicationsGiven').textContent = currentCount + 1;

        } catch (error) {
            console.error('Error logging medication:', error);
            this.showNotification('Error logging medication. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="ri-save-line mr-2"></i>Log Medication';
        }
    }

    openCareNotesModal() {
        const modal = document.getElementById('careNotesModal');
        document.getElementById('careNotesForm').reset();
        modal.classList.remove('hidden');
    }

    closeCareNotesModal() {
        document.getElementById('careNotesModal').classList.add('hidden');
        document.getElementById('careNotesForm').reset();
    }

    async saveCareNotes() {
        const form = document.getElementById('careNotesForm');
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Saving...';

            const patientId = document.getElementById('careNotesPatientSelect').value;
            const noteType = document.getElementById('noteType').value;
            const careNotes = document.getElementById('careNotesText').value;
            const priority = document.getElementById('notePriority').value;

            // Ensure collections exist before using
            if (!window.collections || !window.collections.nursingNotes) {
                throw new Error('Nursing notes collection not available. Please check Firebase configuration.');
            }

            await window.collections.nursingNotes.add({
                patientId,
                noteType,
                notes: careNotes,
                priority,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: this.currentUser.uid,
                createdByName: this.currentUser.displayName || 'Nurse',
                createdByType: 'nurse'
            });

            // Update patient record
            await window.collections.patients.doc(patientId).update({
                lastNursingNote: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.showNotification('Care notes saved successfully!', 'success');
            this.closeCareNotesModal();

        } catch (error) {
            console.error('Error saving care notes:', error);
            this.showNotification('Error saving care notes. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="ri-save-line mr-2"></i>Save Notes';
        }
    }

    async getAICareRecommendations() {
        try {
            // Create a modal to show AI recommendations
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
            modal.innerHTML = `
                <div class="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                    <div class="p-6 border-b border-gray-200">
                        <div class="flex items-center justify-between">
                            <h3 class="text-lg font-semibold text-gray-800 flex items-center">
                                <i class="ri-robot-line text-indigo-600 mr-2"></i>
                                AI Care Recommendations
                            </h3>
                            <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
                                <i class="ri-close-line text-xl"></i>
                            </button>
                        </div>
                    </div>
                    <div class="p-6">
                        <div id="aiRecommendationsContent">
                            <div class="flex items-center space-x-2 text-indigo-600">
                                <i class="ri-loader-4-line animate-spin"></i>
                                <span>Getting AI care recommendations...</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Get AI recommendations based on current patient data
            const recommendations = await this.callGeminiAPIForCare();
            
            document.getElementById('aiRecommendationsContent').innerHTML = `
                <div class="space-y-4">
                    <div class="bg-indigo-50 rounded-lg p-4">
                        <h4 class="font-medium text-indigo-800 mb-2">General Nursing Care Tips</h4>
                        <div class="text-sm text-indigo-700 space-y-2">
                            ${recommendations.replace(/\n/g, '<br>')}
                        </div>
                    </div>
                    <div class="text-xs text-gray-500 bg-gray-50 rounded p-3">
                        <i class="ri-information-line mr-1"></i>
                        These are AI-generated suggestions for general nursing care. Always follow your facility's protocols and consult with healthcare providers for specific patient care decisions.
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Error getting AI care recommendations:', error);
            this.showNotification('Unable to get AI recommendations at this time.', 'error');
        }
    }

    async callGeminiAPIForCare() {
        // Use the real Gemini AI service for nursing recommendations
        if (window.geminiAI && window.geminiAI.isConfigured()) {
            console.log('🤖 Using real Gemini AI for nursing care recommendations');
            return await window.geminiAI.getNursingRecommendations({
                patientCondition: 'General nursing care',
                riskFactors: ['Standard care protocols']
            });
        }
        
        // Fallback if Gemini AI not loaded
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(`**General Nursing Care Recommendations:**

• **Vital Signs Monitoring**: Check vitals every 4-6 hours for stable patients, more frequently for critical patients
• **Pain Assessment**: Use pain scales (0-10) and document patient's pain levels regularly
• **Infection Prevention**: Maintain proper hand hygiene and follow isolation protocols when necessary
• **Patient Mobility**: Encourage mobility and position changes every 2 hours to prevent pressure ulcers
• **Medication Safety**: Always verify the "5 Rights" - Right patient, drug, dose, route, and time
• **Communication**: Keep patients and families informed about care plans and procedures
• **Documentation**: Record all nursing interventions, patient responses, and changes in condition
• **Fall Prevention**: Assess fall risk and implement appropriate safety measures
• **Nutrition & Hydration**: Monitor intake/output and encourage adequate nutrition
• **Emotional Support**: Provide comfort and emotional support to patients and families

**Priority Focus Areas:**
• Critical patients require continuous monitoring
• Post-operative patients need frequent pain and wound assessments  
• Elderly patients need extra attention to mobility and cognitive status
• Patients with chronic conditions require medication adherence monitoring`);
            }, 2000);
        });
    }

    async viewPatientCareDetails(patientId) {
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

            // Get recent vitals
            const vitalsSnapshot = await window.collections.vitals
                .where('patientId', '==', patientId)
                .orderBy('recordedAt', 'desc')
                .limit(5)
                .get();

            const vitals = [];
            vitalsSnapshot.forEach(doc => {
                vitals.push({ id: doc.id, ...doc.data() });
            });

            // Get recent nursing notes
            const notesSnapshot = await window.collections.nursingNotes
                .where('patientId', '==', patientId)
                .orderBy('createdAt', 'desc')
                .limit(5)
                .get();

            const nursingNotes = [];
            notesSnapshot.forEach(doc => {
                nursingNotes.push({ id: doc.id, ...doc.data() });
            });

            // Get recent medications
            const medicationsSnapshot = await window.collections.medicationLogs
                .where('patientId', '==', patientId)
                .orderBy('administeredAt', 'desc')
                .limit(5)
                .get();

            const medications = [];
            medicationsSnapshot.forEach(doc => {
                medications.push({ id: doc.id, ...doc.data() });
            });

            content.innerHTML = `
                <div class="space-y-6">
                    <!-- Patient Header -->
                    <div class="bg-pink-50 rounded-lg p-6">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-4">
                                <div class="w-16 h-16 bg-pink-200 rounded-full flex items-center justify-center">
                                    <i class="ri-user-heart-line text-pink-700 text-2xl"></i>
                                </div>
                                <div>
                                    <h4 class="text-xl font-semibold text-pink-900">
                                        ${patient.firstName} ${patient.lastName}
                                    </h4>
                                    <p class="text-pink-700">Patient ID: ${patient.patientId}</p>
                                    <p class="text-sm text-pink-600">${age} years • ${patient.gender} • ${patient.departmentName}</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${this.getPriorityColor(patient.priority)}">
                                    ${patient.priority?.toUpperCase()}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Care Overview -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="bg-blue-50 rounded-lg p-4">
                            <div class="flex items-center">
                                <i class="ri-heart-pulse-line text-blue-600 text-xl mr-3"></i>
                                <div>
                                    <p class="text-sm text-blue-600">Latest Vitals</p>
                                    <p class="font-semibold text-blue-800">
                                        ${vitals.length > 0 ? 
                                            new Date(vitals[0].recordedAt?.toDate()).toLocaleDateString() : 
                                            'No records'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-green-50 rounded-lg p-4">
                            <div class="flex items-center">
                                <i class="ri-medicine-bottle-line text-green-600 text-xl mr-3"></i>
                                <div>
                                    <p class="text-sm text-green-600">Last Medication</p>
                                    <p class="font-semibold text-green-800">
                                        ${medications.length > 0 ? 
                                            new Date(medications[0].administeredAt?.toDate()).toLocaleDateString() : 
                                            'No records'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-purple-50 rounded-lg p-4">
                            <div class="flex items-center">
                                <i class="ri-file-text-line text-purple-600 text-xl mr-3"></i>
                                <div>
                                    <p class="text-sm text-purple-600">Care Notes</p>
                                    <p class="font-semibold text-purple-800">${nursingNotes.length} entries</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Recent Vital Signs -->
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
                                            <span class="text-xs text-blue-600">by ${vital.recordedByName}</span>
                                        </div>
                                        <div class="grid grid-cols-6 gap-4 text-sm">
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
                                            <div>
                                                <span class="text-blue-600">Pain:</span>
                                                <span class="ml-1 font-medium">${vital.vitals?.painLevel || 'N/A'}/10</span>
                                            </div>
                                        </div>
                                        ${vital.notes ? `<p class="text-sm text-blue-700 mt-2">${vital.notes}</p>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<p class="text-gray-500 text-center py-4">No vital signs recorded</p>'}
                    </div>

                    <!-- Recent Medications -->
                    <div class="bg-white border rounded-lg p-4">
                        <h5 class="font-semibold text-gray-800 mb-3">Recent Medications</h5>
                        ${medications.length > 0 ? `
                            <div class="space-y-3">
                                ${medications.map(med => `
                                    <div class="border-l-4 border-green-400 bg-green-50 p-3">
                                        <div class="flex justify-between items-start">
                                            <div>
                                                <p class="font-medium text-green-800">${med.medication?.name}</p>
                                                <p class="text-sm text-green-600">
                                                    ${med.medication?.dosage} • ${med.medication?.route}
                                                </p>
                                                <p class="text-xs text-green-600">
                                                    Given: ${med.medication?.timeGiven ? 
                                                        new Date(med.medication.timeGiven.toDate()).toLocaleString() : 'Unknown time'}
                                                </p>
                                            </div>
                                            <span class="text-xs text-green-600">by ${med.administeredByName}</span>
                                        </div>
                                        ${med.medication?.notes ? `<p class="text-sm text-green-700 mt-2">${med.medication.notes}</p>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<p class="text-gray-500 text-center py-4">No medications logged</p>'}
                    </div>

                    <!-- Nursing Notes -->
                    <div class="bg-white border rounded-lg p-4">
                        <h5 class="font-semibold text-gray-800 mb-3">Recent Care Notes</h5>
                        ${nursingNotes.length > 0 ? `
                            <div class="space-y-3">
                                ${nursingNotes.map(note => `
                                    <div class="border-l-4 border-purple-400 bg-purple-50 p-3">
                                        <div class="flex justify-between items-start mb-2">
                                            <div>
                                                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                                    ${note.noteType?.replace('_', ' ').toUpperCase()}
                                                </span>
                                                ${note.priority && note.priority !== 'normal' ? `
                                                    <span class="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                                        note.priority === 'urgent' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                                    }">
                                                        ${note.priority.toUpperCase()}
                                                    </span>
                                                ` : ''}
                                            </div>
                                            <span class="text-xs text-purple-600">
                                                ${note.createdAt ? 
                                                    new Date(note.createdAt.toDate()).toLocaleDateString() : 'Unknown date'}
                                            </span>
                                        </div>
                                        <p class="text-sm text-purple-800">${note.notes}</p>
                                        <p class="text-xs text-purple-600 mt-1">by ${note.createdByName}</p>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<p class="text-gray-500 text-center py-4">No care notes available</p>'}
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-end space-x-3 pt-4 border-t">
                        <button onclick="quickRecordVitals('${patient.id}')" 
                            class="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700">
                            <i class="ri-heart-pulse-line mr-2"></i>Record Vitals
                        </button>
                    </div>
                </div>
            `;

            modal.classList.remove('hidden');

        } catch (error) {
            console.error('Error loading patient care details:', error);
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
function viewPatientCareDetails(patientId) {
    if (window.nurseManager) {
        window.nurseManager.viewPatientCareDetails(patientId);
    }
}

function quickRecordVitals(patientId) {
    if (window.nurseManager) {
        window.nurseManager.quickRecordVitals(patientId);
    }
}

function openRecordVitalsModal() {
    if (window.nurseManager) {
        window.nurseManager.openRecordVitalsModal();
    }
}

function closeRecordVitalsModal() {
    if (window.nurseManager) {
        window.nurseManager.closeRecordVitalsModal();
    }
}

function openMedicationLogModal() {
    if (window.nurseManager) {
        window.nurseManager.openMedicationLogModal();
    }
}

function closeMedicationLogModal() {
    if (window.nurseManager) {
        window.nurseManager.closeMedicationLogModal();
    }
}

function openCareNotesModal() {
    if (window.nurseManager) {
        window.nurseManager.openCareNotesModal();
    }
}

function closeCareNotesModal() {
    if (window.nurseManager) {
        window.nurseManager.closeCareNotesModal();
    }
}

function closePatientDetailsModal() {
    if (window.nurseManager) {
        window.nurseManager.closePatientDetailsModal();
    }
}

function getAICareRecommendations() {
    if (window.nurseManager) {
        window.nurseManager.getAICareRecommendations();
    }
}

function previousPage() {
    if (window.nurseManager && window.nurseManager.currentPage > 1) {
        window.nurseManager.currentPage--;
        window.nurseManager.renderPatientCards();
    }
}

function nextPage() {
    if (window.nurseManager) {
        const maxPage = Math.ceil(window.nurseManager.filteredPatients.length / window.nurseManager.itemsPerPage);
        if (window.nurseManager.currentPage < maxPage) {
            window.nurseManager.currentPage++;
            window.nurseManager.renderPatientCards();
        }
    }
}

function signOut() {
    window.auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
}

// Initialize Nurse Manager
let nurseManager;
document.addEventListener('DOMContentLoaded', () => {
    const initializeNurseManager = () => {
        if (window.collections && window.collections.patients && window.auth && window.db) {
            console.log('Firebase initialized successfully, creating NurseManager');
            nurseManager = new NurseManager();
            window.nurseManager = nurseManager;
        } else {
            console.log('Waiting for Firebase initialization...');
            setTimeout(initializeNurseManager, 100);
        }
    };
    
    initializeNurseManager();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (nurseManager) {
        nurseManager.cleanup();
    }
});
