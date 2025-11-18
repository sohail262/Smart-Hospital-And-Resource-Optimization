class PatientManager {
    constructor() {
        this.patients = [];
        this.filteredPatients = [];
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.listeners = [];
        
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
        this.loadPatientStatistics();
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
        // Search
        document.getElementById('patientSearch').addEventListener('input', (e) => {
            this.filterPatients();
        });

        // Filters
        document.getElementById('departmentFilter').addEventListener('change', () => this.filterPatients());
        document.getElementById('statusFilter').addEventListener('change', () => this.filterPatients());
        document.getElementById('priorityFilter').addEventListener('change', () => this.filterPatients());

        // Add patient form
        document.getElementById('addPatientForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addPatient();
        });

        // Discharge patient form
        document.getElementById('dischargeForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.dischargePatient();
        });
    }

    setupRealtimeListeners() {
        // Patients listener
        this.listeners.push(
            window.collections.patients
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

        // Beds listener for availability
        this.listeners.push(
            window.collections.beds.onSnapshot(snapshot => {
                this.beds = new Map();
                snapshot.forEach(doc => {
                    this.beds.set(doc.id, { id: doc.id, ...doc.data() });
                });
            })
        );
    }

    async loadDepartments() {
        const select = document.getElementById('patientDepartment');
        select.innerHTML = '<option value="">Select Department</option>';
        
        const snapshot = await window.collections.departments.get();
        snapshot.forEach(doc => {
            const dept = doc.data();
            select.innerHTML += `<option value="${doc.id}">${dept.name}</option>`;
        });
    }

    filterPatients() {
        const searchTerm = document.getElementById('patientSearch').value.toLowerCase();
        const departmentFilter = document.getElementById('departmentFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        const priorityFilter = document.getElementById('priorityFilter').value;

        this.filteredPatients = this.patients.filter(patient => {
            // Search filter
            if (searchTerm) {
                const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
                const patientId = patient.patientId?.toLowerCase() || '';
                if (!fullName.includes(searchTerm) && !patientId.includes(searchTerm)) {
                    return false;
                }
            }

            // Department filter
            if (departmentFilter && patient.department !== departmentFilter) {
                return false;
            }

            // Status filter
            if (statusFilter && patient.status !== statusFilter) {
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
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedPatients = this.filteredPatients.slice(startIndex, endIndex);

        tbody.innerHTML = '';

        if (paginatedPatients.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="px-6 py-8 text-center text-gray-500">
                        No patients found
                    </td>
                </tr>
            `;
            return;
        }

        paginatedPatients.forEach(patient => {
            const age = this.calculateAge(patient.dateOfBirth);
            const admittedDate = patient.admittedAt ? 
                new Date(patient.admittedAt.toDate()).toLocaleDateString() : 'N/A';

            const priorityColors = {
                critical: 'red',
                high: 'orange',
                medium: 'yellow',
                low: 'gray'
            };
            const priorityColor = priorityColors[patient.priority] || 'gray';

            const statusColors = {
                active: 'green',
                discharged: 'blue',
                transferred: 'purple'
            };
            const statusColor = statusColors[patient.status] || 'gray';

            tbody.innerHTML += `
                <tr class="hover:bg-gray-50 transition">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #${patient.patientId || patient.id.substring(0, 8)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div class="flex items-center">
                            <div class="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                                <i class="ri-user-3-line text-gray-600 text-xs"></i>
                            </div>
                            <div>
                                <p class="font-medium">${patient.firstName} ${patient.lastName}</p>
                                <p class="text-xs text-gray-500">${patient.contactNumber || 'No contact'}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${age}y / ${patient.gender}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${patient.departmentName || 'Unassigned'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${patient.bedNumber ? 
                            `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <i class="ri-hotel-bed-line mr-1"></i>
                                ${patient.bedNumber}
                            </span>` : 
                            `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                <i class="ri-hotel-bed-line mr-1"></i>
                                No bed
                            </span>`
                        }
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 py-1 text-xs font-medium rounded-full bg-${priorityColor}-100 text-${priorityColor}-800">
                            ${patient.priority?.toUpperCase()}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 py-1 text-xs font-medium rounded-full bg-${statusColor}-100 text-${statusColor}-800">
                            ${patient.status?.toUpperCase()}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${admittedDate}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onclick="viewPatientDetails('${patient.id}')" 
                            class="text-blue-600 hover:text-blue-900 mr-3">
                            <i class="ri-eye-line"></i>
                        </button>
                        <button onclick="editPatient('${patient.id}')" 
                            class="text-indigo-600 hover:text-indigo-900 mr-3">
                            <i class="ri-edit-line"></i>
                        </button>
                        <button onclick="allocateResources('${patient.id}')" 
                            class="text-green-600 hover:text-green-900 mr-3" title="Allocate Resources">
                            <i class="ri-box-3-line"></i>
                        </button>
                        ${patient.status === 'active' ? `
                            <button onclick="dischargePatient('${patient.id}')" 
                                class="text-orange-600 hover:text-orange-900">
                                <i class="ri-logout-box-r-line"></i>
                            </button>
                        ` : ''}
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
        document.getElementById('showingStart').textContent = 
            Math.min((this.currentPage - 1) * this.itemsPerPage + 1, this.filteredPatients.length);
        document.getElementById('showingEnd').textContent = 
            Math.min(this.currentPage * this.itemsPerPage, this.filteredPatients.length);
        document.getElementById('totalRecords').textContent = this.filteredPatients.length;

        document.getElementById('prevBtn').disabled = this.currentPage === 1;
        document.getElementById('nextBtn').disabled = 
            this.currentPage * this.itemsPerPage >= this.filteredPatients.length;
    }

    async updateStatistics() {
        const stats = {
            total: this.patients.length,
            newAdmissions: 0,
            pendingDischarge: 0,
            critical: 0
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        this.patients.forEach(patient => {
            // New admissions today
            if (patient.admittedAt) {
                const admittedDate = patient.admittedAt.toDate();
                if (admittedDate >= today) {
                    stats.newAdmissions++;
                }
            }

            // Status-based counts
            if (patient.status === 'active' && patient.dischargeReady) {
                stats.pendingDischarge++;
            }

            if (patient.priority === 'critical' && patient.status === 'active') {
                stats.critical++;
            }
        });

        // Update UI
        document.getElementById('totalPatients').textContent = stats.total;
        document.getElementById('newAdmissions').textContent = stats.newAdmissions;
        document.getElementById('pendingDischarge').textContent = stats.pendingDischarge;
        document.getElementById('criticalPatients').textContent = stats.critical;
    }

    async addPatient() {
        const form = document.getElementById('addPatientForm');
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            // Check if Firebase is ready
            if (!window.collections || !window.collections.departments) {
                throw new Error('Firebase collections not available. Please refresh the page.');
            }
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Adding...';

            // Generate human-readable patient code
            const patientCode = await this.generatePatientId();

            const patientData = {
                patientId: patientCode,
                firstName: document.getElementById('firstName').value,
                lastName: document.getElementById('lastName').value,
                dateOfBirth: firebase.firestore.Timestamp.fromDate(
                    new Date(document.getElementById('dateOfBirth').value)
                ),
                gender: document.getElementById('gender').value,
                contactNumber: document.getElementById('contactNumber').value,
                emergencyContact: document.getElementById('emergencyContact').value,
                department: document.getElementById('patientDepartment').value,
                priority: document.getElementById('priority').value,
                chiefComplaint: document.getElementById('chiefComplaint').value,
                medicalHistory: document.getElementById('medicalHistory').value,
                allergies: document.getElementById('allergies').value.split(',').map(a => a.trim()),
                status: 'active',
                admittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                admittedBy: this.currentUser.uid
            };

            // Get department name
            const deptDoc = await window.collections.departments.doc(patientData.department).get();
            if (deptDoc.exists) {
                patientData.departmentName = deptDoc.data().name;
            }

            // Create patient first
            const docRef = await window.collections.patients.add(patientData);

            // Check bed availability and assign bed
            const bedAssignment = await this.assignBedToPatient(docRef.id, patientData.department);
            if (!bedAssignment.success) {
                // Handle bed assignment failure
                this.showNotification(bedAssignment.message, 'error');
                if (bedAssignment.suggestions) {
                    this.showBedAlternatives(bedAssignment.suggestions, { ...patientData, id: docRef.id });
                }
                return;
            }

            // Log activity
            await this.logActivity('patient_admitted', 
                `New patient admitted: ${patientData.firstName} ${patientData.lastName}`);

            // Create initial vitals record
            await window.collections.vitals.add({
                patientId: docRef.id,
                recordedAt: firebase.firestore.FieldValue.serverTimestamp(),
                recordedBy: this.currentUser.uid,
                vitals: {
                    bloodPressure: '',
                    heartRate: '',
                    temperature: '',
                    oxygenSaturation: '',
                    respiratoryRate: ''
                }
            });

            // Update department load
            if (deptDoc.exists) {
                await window.collections.departments.doc(patientData.department).update({
                    currentLoad: firebase.firestore.FieldValue.increment(1)
                });
            }

            // AI-based initial assessment
            await this.requestAIAssessment(docRef.id, patientData);

            // Start billing for the patient
            if (window.billingManager) {
                await window.billingManager.startPatientBilling(docRef.id, patientData.department, patientData.admittedAt);
                console.log('Billing started for patient:', docRef.id);
            } else {
                console.warn('Billing manager not available, billing not started');
            }

            this.showNotification('Patient added successfully!', 'success');
            form.reset();
            closeAddPatientModal();

        } catch (error) {
            console.error('Error adding patient:', error);
            this.showNotification('Error adding patient. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Add Patient';
        }
    }

    async addPatientWithAlternative(patientData) {
        try {
            console.log('Adding patient with alternative department:', patientData);
            
            // Get department name
            const deptDoc = await window.collections.departments.doc(patientData.department).get();
            if (deptDoc.exists) {
                patientData.departmentName = deptDoc.data().name;
            }

            // Update the existing patient document with new department
            if (patientData.patientId) {
                await window.collections.patients.doc(patientData.patientId).update({
                    department: patientData.department,
                    departmentName: patientData.departmentName,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Try to assign bed in alternative department
                const bedAssignment = await this.assignBedToPatient(patientData.patientId, patientData.department);
                
                if (bedAssignment.success) {
                    // Update department loads
                    if (deptDoc.exists) {
                        await window.collections.departments.doc(patientData.department).update({
                            currentLoad: firebase.firestore.FieldValue.increment(1)
                        });
                    }

                    this.showNotification(`Patient admitted to ${patientData.departmentName} - Bed ${bedAssignment.bedNumber} assigned`, 'success');
                    
                    // Log activity
                    await this.logActivity('patient_admitted_alternative', 
                        `Patient ${patientData.firstName} ${patientData.lastName} admitted to alternative department: ${patientData.departmentName}`);
                    
                    closeAddPatientModal();
                    this.filterPatients();
                } else {
                    this.showNotification('Failed to assign bed in alternative department', 'error');
                }
            }
        } catch (error) {
            console.error('Error adding patient with alternative:', error);
            this.showNotification('Error adding patient. Please try again.', 'error');
        }
    }

    async generatePatientId() {
        // Check if Firebase is ready
        if (!window.collections || !window.collections.patients) {
            throw new Error('Firebase collections not available');
        }
        
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        
        // Get count for today
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
        
        const snapshot = await window.collections.patients
            .where('admittedAt', '>=', startOfDay)
            .where('admittedAt', '<', endOfDay)
            .get();
        
        const count = snapshot.size + 1;
        return `P${year}${month}${day}${count.toString().padStart(4, '0')}`;
    }

    async findAvailableBed(departmentId) {
        // Check if Firebase is ready
        if (!window.collections || !window.collections.beds) {
            throw new Error('Firebase collections not available');
        }
        
        const bedsSnapshot = await window.collections.beds
            .where('departmentId', '==', departmentId)
            .where('status', '==', 'available')
            .limit(1)
            .get();

        if (!bedsSnapshot.empty) {
            return { id: bedsSnapshot.docs[0].id, ...bedsSnapshot.docs[0].data() };
        }
        return null;
    }

    async assignBedToPatient(patientId, departmentId) {
        try {
            console.log('Attempting to assign bed for patient:', patientId, 'in department:', departmentId);
            
            // First, check if department exists
            const deptDoc = await window.collections.departments.doc(departmentId).get();
            if (!deptDoc.exists) {
                console.error('Department not found:', departmentId);
                return { success: false, message: 'Department not found' };
            }
            
            console.log('Department found:', deptDoc.data().name);
            
            // Check if department has available beds
            const availableBed = await this.findAvailableBed(departmentId);
            
            if (availableBed) {
                console.log('Assigning bed:', availableBed.bedNumber);
                
                // Assign the bed
                await db.runTransaction(async (tx) => {
                    tx.update(window.collections.beds.doc(availableBed.id), {
                        status: 'occupied',
                        patientId: patientId,
                        occupiedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    tx.update(window.collections.patients.doc(patientId), {
                        bedId: availableBed.id,
                        bedNumber: availableBed.bedNumber
                    });
                });
                
                console.log('Bed assigned successfully:', availableBed.bedNumber);
                return { success: true, bedNumber: availableBed.bedNumber };
            } else {
                // Check total beds in department
                const allBedsSnapshot = await window.collections.beds
                    .where('departmentId', '==', departmentId)
                    .get();
                
                console.warn(`No available beds in department. Total beds: ${allBedsSnapshot.size}`);
                
                if (allBedsSnapshot.size === 0) {
                    return {
                        success: false,
                        message: `No beds exist in this department. Please initialize beds first.`
                    };
                }
                
                // Department is full, find alternatives
                const alternatives = await this.findAlternativeDepartments(departmentId);
                return {
                    success: false,
                    message: `All ${allBedsSnapshot.size} beds in ${deptDoc.data().name} are occupied.`,
                    suggestions: alternatives
                };
            }
        } catch (error) {
            console.error('Error assigning bed:', error);
            return {
                success: false,
                message: 'Error assigning bed: ' + error.message
            };
        }
    }

    async findAlternativeDepartments(originalDepartmentId) {
        try {
            const alternatives = [];
            const departmentsSnapshot = await window.collections.departments.get();
            
            for (const deptDoc of departmentsSnapshot.docs) {
                if (deptDoc.id === originalDepartmentId) continue;
                
                const deptData = deptDoc.data();
                const availableBeds = await window.collections.beds
                    .where('departmentId', '==', deptDoc.id)
                    .where('status', '==', 'available')
                    .get();
                
                if (availableBeds.size > 0) {
                    alternatives.push({
                        departmentId: deptDoc.id,
                        departmentName: deptData.name,
                        availableBeds: availableBeds.size,
                        capacity: deptData.capacity,
                        utilization: Math.round((deptData.currentLoad / deptData.capacity) * 100)
                    });
                }
            }
            
            return alternatives.sort((a, b) => a.utilization - b.utilization);
        } catch (error) {
            console.error('Error finding alternatives:', error);
            return [];
        }
    }

    getDepartmentName(departmentId) {
        const departmentNames = {
            'Emergency': 'Emergency Ward',
            'ICU': 'Intensive Care Unit',
            'General Ward': 'General Ward',
            'Pediatrics': 'Pediatrics',
            'Surgery': 'Surgery',
            'Maternity': 'Maternity'
        };
        return departmentNames[departmentId] || departmentId;
    }

    showBedAlternatives(alternatives, patientData) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
        
        const hasAlternatives = alternatives && alternatives.length > 0;
        
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">
                    <i class="ri-hotel-bed-line text-red-500 mr-2"></i>
                    No Beds Available in ${patientData.departmentName || this.getDepartmentName(patientData.department)}
                </h3>
                <p class="text-gray-600 mb-4">The requested department is at full capacity. What would you like to do?</p>
                
                ${hasAlternatives ? `
                    <div class="mb-6">
                        <h4 class="font-semibold text-gray-700 mb-3">Option 1: Move to Another Department</h4>
                        <div class="space-y-3">
                            ${alternatives.map(alt => `
                                <div class="border border-gray-200 rounded-lg p-4 hover:bg-blue-50 cursor-pointer transition" 
                                     onclick="selectAlternativeDepartment('${alt.departmentId}', '${alt.departmentName}')">
                                    <div class="flex justify-between items-center">
                                        <div>
                                            <h5 class="font-medium text-gray-800">${alt.departmentName}</h5>
                                            <p class="text-sm text-gray-600">${alt.availableBeds} beds available</p>
                                        </div>
                                        <div class="text-right">
                                            <span class="text-sm text-gray-500">${alt.utilization}% occupied</span>
                                            <div class="w-20 bg-gray-200 rounded-full h-2 mt-1">
                                                <div class="bg-blue-600 h-2 rounded-full" style="width: ${alt.utilization}%"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="mb-6">
                        <h4 class="font-semibold text-gray-700 mb-3">Option 2: Shift a Bed from Another Department</h4>
                        <button onclick="shiftBedFromDepartment('${patientData.department}', '${patientData.id}')" 
                                class="w-full px-4 py-3 border-2 border-orange-300 rounded-lg hover:bg-orange-50 text-orange-700 font-medium transition">
                            <i class="ri-arrow-left-right-line mr-2"></i>
                            Transfer a bed to ${patientData.departmentName || this.getDepartmentName(patientData.department)}
                        </button>
                        <p class="text-xs text-gray-500 mt-2">This will move an available bed from another department to accommodate this patient.</p>
                    </div>
                ` : `
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                        <p class="text-yellow-800"><i class="ri-alert-line mr-2"></i>No alternative departments with available beds found.</p>
                    </div>
                `}
                
                <div class="flex justify-end space-x-3">
                    <button onclick="closeBedAlternativesModal()" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        Cancel Admission
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Store patient data for alternative selection
        window.currentPatientData = { ...patientData, patientId: patientData.id || patientData.patientId };
        window.bedAlternativesModal = modal;
    }

    async requestAIAssessment(patientId, patientData) {
        try {
            // Create AI insight request
            await window.collections.aiInsights.add({
                type: 'patient_assessment',
                patientId,
                requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
                requestedBy: this.currentUser.uid,
                data: {
                    chiefComplaint: patientData.chiefComplaint,
                    priority: patientData.priority,
                    medicalHistory: patientData.medicalHistory,
                    allergies: patientData.allergies
                },
                status: 'pending'
            });

            // Simulate AI response (in production, this would call an AI service)
            setTimeout(() => {
                this.generateAIAssessment(patientId, patientData);
            }, 2000);

        } catch (error) {
            console.error('Error requesting AI assessment:', error);
        }
    }

    async generateAIAssessment(patientId, patientData) {
        // Simulated AI assessment based on patient data
        const assessment = {
            riskLevel: this.calculateRiskLevel(patientData),
            recommendations: [],
            suggestedTests: [],
            monitoringFrequency: 'standard'
        };

        // Generate recommendations based on chief complaint and priority
        if (patientData.priority === 'critical') {
            assessment.recommendations.push('Continuous vital monitoring required');
            assessment.recommendations.push('Consider ICU transfer if bed available');
            assessment.monitoringFrequency = 'continuous';
        }

        if (patientData.chiefComplaint.toLowerCase().includes('chest pain')) {
            assessment.suggestedTests.push('ECG');
            assessment.suggestedTests.push('Cardiac enzymes');
            assessment.suggestedTests.push('Chest X-ray');
        }

        if (patientData.chiefComplaint.toLowerCase().includes('breathing')) {
            assessment.suggestedTests.push('ABG');
            assessment.suggestedTests.push('Chest X-ray');
            assessment.recommendations.push('Monitor oxygen saturation closely');
        }

        // Save AI assessment
        await window.collections.aiAssessments.add({
            patientId,
            assessment,
            generatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            type: 'initial_assessment'
        });
    }

    calculateRiskLevel(patientData) {
        let riskScore = 0;

        // Age-based risk
        const age = this.calculateAge(patientData.dateOfBirth);
        if (age > 65) riskScore += 2;
        else if (age > 50) riskScore += 1;

        // Priority-based risk
        const priorityScores = { critical: 4, high: 3, medium: 1, low: 0 };
        riskScore += priorityScores[patientData.priority] || 0;

        // Medical history factors
        if (patientData.medicalHistory?.length > 100) riskScore += 1;

        // Determine risk level
        if (riskScore >= 5) return 'high';
        if (riskScore >= 3) return 'medium';
        return 'low';
    }

    async viewPatientDetails(patientId) {
        const modal = document.getElementById('patientDetailsModal');
        const content = document.getElementById('patientDetailsContent');

        try {
            // Check if Firebase is ready
            if (!window.collections || !window.collections.patients) {
                throw new Error('Firebase collections not available. Please refresh the page.');
            }

            // Get patient data
            const patientDoc = await window.collections.patients.doc(patientId).get();
            if (!patientDoc.exists) {
                this.showNotification('Patient not found', 'error');
                return;
            }

            const patient = { id: patientDoc.id, ...patientDoc.data() };
            const age = this.calculateAge(patient.dateOfBirth);

            // Get vitals history
            const vitalsSnapshot = await window.collections.vitals
                .where('patientId', '==', patientId)
                .orderBy('recordedAt', 'desc')
                .limit(5)
                .get();

            const vitalsHistory = [];
            vitalsSnapshot.forEach(doc => {
                vitalsHistory.push({ id: doc.id, ...doc.data() });
            });

            // Get AI assessments
            const aiSnapshot = await window.collections.aiAssessments
                .where('patientId', '==', patientId)
                .orderBy('generatedAt', 'desc')
                .limit(3)
                .get();

            const aiAssessments = [];
            aiSnapshot.forEach(doc => {
                aiAssessments.push({ id: doc.id, ...doc.data() });
            });

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
                            <span class="px-3 py-1 rounded-full text-sm font-medium bg-${
                                patient.priority === 'critical' ? 'red' : 
                                patient.priority === 'high' ? 'orange' : 
                                patient.priority === 'medium' ? 'yellow' : 'gray'
                            }-100 text-${
                                patient.priority === 'critical' ? 'red' : 
                                patient.priority === 'high' ? 'orange' : 
                                patient.priority === 'medium' ? 'yellow' : 'gray'
                            }-800">
                                ${patient.priority?.toUpperCase()}
                            </span>
                            <span class="px-3 py-1 rounded-full text-sm font-medium bg-${
                                patient.status === 'active' ? 'green' : 'blue'
                            }-100 text-${
                                patient.status === 'active' ? 'green' : 'blue'
                            }-800">
                                ${patient.status?.toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <!-- Patient Information Tabs -->
                    <div class="border-b">
                        <nav class="flex space-x-8">
                            <button onclick="showPatientTab('overview')" 
                                class="tab-btn pb-2 px-1 border-b-2 border-blue-600 text-blue-600 font-medium">
                                Overview
                            </button>
                            <button onclick="showPatientTab('vitals')" 
                                class="tab-btn pb-2 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                                Vitals
                            </button>
                            <button onclick="showPatientTab('ai-insights')" 
                                class="tab-btn pb-2 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                                AI Insights
                            </button>
                            <button onclick="showPatientTab('billing')" 
                                class="tab-btn pb-2 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                                Billing
                            </button>
                            <button onclick="showPatientTab('history')" 
                                class="tab-btn pb-2 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                                History
                            </button>
                        </nav>
                    </div>

                    <!-- Tab Content -->
                    <div id="overview-tab" class="tab-content">
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
                                        ${patient.bedNumber ? 
                                            `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                <i class="ri-hotel-bed-line mr-1"></i>
                                                ${patient.bedNumber}
                                            </span>` : 
                                            `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                <i class="ri-hotel-bed-line mr-1"></i>
                                                Unassigned
                                            </span>`
                                        }
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-500">Admitted</span>
                                        <span class="font-medium">${
                                            patient.admittedAt ? 
                                            new Date(patient.admittedAt.toDate()).toLocaleString() : 
                                            'N/A'
                                        }</span>
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
                    </div>

                    <div id="vitals-tab" class="tab-content hidden">
                        <div class="space-y-4">
                            <div class="flex items-center justify-between mb-4">
                                <h5 class="font-semibold text-gray-800">Vital Signs History</h5>
                            <button onclick="recordNewVitals('${patientId}')" 
                                    class="text-sm bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700">
                                    Record New Vitals
                                </button>
                            </div>
                            
                            ${vitalsHistory.length > 0 ? `
                                <div class="space-y-3">
                                    ${vitalsHistory.map(vital => `
                                        <div class="bg-gray-50 rounded-lg p-4">
                                            <div class="flex items-center justify-between mb-3">
                                                <span class="text-sm text-gray-500">
                                                    ${vital.recordedAt ? 
                                                        new Date(vital.recordedAt.toDate()).toLocaleString() : 
                                                        'Unknown time'
                                                    }
                                                </span>
                                                <span class="text-xs text-gray-400">
                                                    Recorded by: ${vital.recordedByName || 'Unknown'}
                                                </span>
                                            </div>
                                            <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                                                <div>
                                                    <p class="text-xs text-gray-500">Blood Pressure</p>
                                                    <p class="font-semibold">${vital.vitals?.bloodPressure || '-'}</p>
                                                </div>
                                                <div>
                                                    <p class="text-xs text-gray-500">Heart Rate</p>
                                                    <p class="font-semibold">${vital.vitals?.heartRate || '-'} bpm</p>
                                                </div>
                                                <div>
                                                    <p class="text-xs text-gray-500">Temperature</p>
                                                    <p class="font-semibold">${vital.vitals?.temperature || '-'}°C</p>
                                                </div>
                                                <div>
                                                    <p class="text-xs text-gray-500">O₂ Saturation</p>
                                                    <p class="font-semibold">${vital.vitals?.oxygenSaturation || '-'}%</p>
                                                </div>
                                                <div>
                                                    <p class="text-xs text-gray-500">Resp. Rate</p>
                                                    <p class="font-semibold">${vital.vitals?.respiratoryRate || '-'}/min</p>
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : '<p class="text-center text-gray-500">No vitals recorded yet</p>'}
                        </div>
                    </div>

                    <div id="ai-insights-tab" class="tab-content hidden">
                        <div class="space-y-4">
                            <h5 class="font-semibold text-gray-800 mb-4">AI-Generated Insights</h5>
                            
                            ${aiAssessments.length > 0 ? aiAssessments.map(assessment => `
                                <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                    <div class="flex items-center justify-between mb-3">
                                        <div class="flex items-center space-x-2">
                                            <i class="ri-robot-line text-blue-600"></i>
                                            <span class="font-medium text-blue-800">
                                                ${assessment.type === 'initial_assessment' ? 
                                                    'Initial Assessment' : 
                                                    'Follow-up Assessment'
                                                }
                                            </span>
                                        </div>
                                        <span class="text-xs text-blue-600">
                                            ${assessment.generatedAt ? 
                                                new Date(assessment.generatedAt.toDate()).toLocaleString() : 
                                                'Unknown time'
                                            }
                                        </span>
                                    </div>
                                    
                                    <div class="space-y-3">
                                        <div>
                                            <span class="text-xs font-medium text-blue-700">Risk Level:</span>
                                            <span class="ml-2 px-2 py-1 rounded-full text-xs font-medium ${
                                                assessment.assessment.riskLevel === 'high' ? 'bg-red-100 text-red-800' :
                                                assessment.assessment.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-green-100 text-green-800'
                                            }">
                                                ${assessment.assessment.riskLevel?.toUpperCase()}
                                            </span>
                                        </div>
                                        
                                        ${assessment.assessment.recommendations?.length > 0 ? `
                                            <div>
                                                <span class="text-xs font-medium text-blue-700">Recommendations:</span>
                                                <ul class="mt-1 space-y-1">
                                                    ${assessment.assessment.recommendations.map(rec => `
                                                        <li class="text-sm text-blue-800 flex items-center">
                                                            <i class="ri-check-line mr-2 text-blue-600"></i>
                                                            ${rec}
                                                        </li>
                                                    `).join('')}
                                                </ul>
                                            </div>
                                        ` : ''}
                                        
                                        ${assessment.assessment.suggestedTests?.length > 0 ? `
                                            <div>
                                                <span class="text-xs font-medium text-blue-700">Suggested Tests:</span>
                                                <div class="mt-1 flex flex-wrap gap-2">
                                                    ${assessment.assessment.suggestedTests.map(test => `
                                                        <span class="px-2 py-1 bg-white text-blue-700 rounded text-xs border border-blue-200">
                                                            ${test}
                                                        </span>
                                                    `).join('')}
                                                </div>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            `).join('') : `
                                <div class="text-center py-8">
                                    <i class="ri-robot-line text-4xl text-gray-300 mb-3"></i>
                                    <p class="text-gray-500">No AI insights available yet</p>
                                    <p class="text-sm text-gray-400 mt-1">AI assessments are generated automatically</p>
                                </div>
                            `}
                        </div>
                    </div>

                    <div id="billing-tab" class="tab-content hidden">
                        <div class="space-y-4">
                            <h5 class="font-semibold text-gray-800 mb-4">Billing Information</h5>
                            <div id="patient-billing-content">
                                <!-- Billing content will be loaded here -->
                                <p class="text-center text-gray-500">Loading billing information...</p>
                            </div>
                        </div>
                    </div>

                    <div id="history-tab" class="tab-content hidden">
                        <div class="space-y-4">
                            <h5 class="font-semibold text-gray-800 mb-4">Patient History</h5>
                            <div class="text-center py-8">
                                <i class="ri-history-line text-4xl text-gray-300 mb-3"></i>
                                <p class="text-gray-500">Patient history feature coming soon</p>
                                <p class="text-sm text-gray-400 mt-1">This will include treatment history, medications, and more</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            modal.classList.remove('hidden');
            modal.classList.add('flex');

            // Load billing information using internal method
            this.loadPatientBilling(patientId);

        } catch (error) {
            console.error('Error loading patient details:', error);
            this.showNotification('Error loading patient details', 'error');
        }
    }

    calculateLOS(admittedAt) {
        if (!admittedAt) return 0;
        const admitted = admittedAt.toDate();
        const now = new Date();
        const diffTime = Math.abs(now - admitted);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    async editPatient(patientId) {
        const modal = document.getElementById('editPatientModal');
        const content = document.getElementById('editPatientContent');

        try {
            // Check if modal elements exist
            if (!modal) {
                console.error('Edit patient modal not found in DOM');
                this.showNotification('Edit patient modal not available', 'error');
                return;
            }

            if (!content) {
                console.error('Edit patient content element not found in DOM');
                this.showNotification('Edit patient form not available', 'error');
                return;
            }

            const patientDoc = await window.collections.patients.doc(patientId).get();
            if (!patientDoc.exists) {
                this.showNotification('Patient not found', 'error');
                return;
            }
            
            const patient = patientDoc.data();
            const dob = patient.dateOfBirth ? 
                patient.dateOfBirth.toDate().toISOString().split('T')[0] : '';

            // Load departments for transfer
            const departmentsSnapshot = await window.collections.departments.orderBy('name').get();
            let departmentOptions = '<option value="">Select Department</option>';
            departmentsSnapshot.forEach(doc => {
                const dept = doc.data();
                const selected = patient.department === doc.id ? 'selected' : '';
                departmentOptions += `<option value="${doc.id}" ${selected}>${dept.name}</option>`;
            });

            content.innerHTML = `
                <form id="editPatientForm" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                            <input type="text" id="editFirstName" value="${patient.firstName}" 
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                            <input type="text" id="editLastName" value="${patient.lastName}" 
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                            <input type="date" id="editDateOfBirth" value="${dob}" 
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                            <select id="editGender" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="male" ${patient.gender === 'male' ? 'selected' : ''}>Male</option>
                                <option value="female" ${patient.gender === 'female' ? 'selected' : ''}>Female</option>
                                <option value="other" ${patient.gender === 'other' ? 'selected' : ''}>Other</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                            <input type="tel" id="editContactNumber" value="${patient.contactNumber || ''}" 
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
                            <input type="tel" id="editEmergencyContact" value="${patient.emergencyContact || ''}" 
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Department
                                <span class="text-xs text-gray-500">(Change to transfer patient)</span>
                            </label>
                            <select id="editDepartment" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                                ${departmentOptions}
                            </select>
                            <p class="text-xs text-orange-600 mt-1">
                                <i class="ri-alert-line"></i> Changing department will transfer the patient and update billing
                            </p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                            <select id="editPriority" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="low" ${patient.priority === 'low' ? 'selected' : ''}>Low</option>
                                <option value="medium" ${patient.priority === 'medium' ? 'selected' : ''}>Medium</option>
                                <option value="high" ${patient.priority === 'high' ? 'selected' : ''}>High</option>
                                <option value="critical" ${patient.priority === 'critical' ? 'selected' : ''}>Critical</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select id="editStatus" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="active" ${patient.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="transferred" ${patient.status === 'transferred' ? 'selected' : ''}>Transferred</option>
                                <option value="discharged" ${patient.status === 'discharged' ? 'selected' : ''}>Discharged</option>
                            </select>
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Chief Complaint</label>
                        <textarea id="editChiefComplaint" rows="2" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">${patient.chiefComplaint || ''}</textarea>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Medical History</label>
                        <textarea id="editMedicalHistory" rows="3" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">${patient.medicalHistory || ''}</textarea>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
                        <input type="text" id="editAllergies" value="${patient.allergies ? patient.allergies.join(', ') : ''}" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                            placeholder="Separate multiple allergies with commas">
                    </div>
                    
                    <div class="flex justify-end space-x-3 pt-4">
                        <button type="button" onclick="closeEditPatientModal()" 
                            class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                            Cancel
                        </button>
                        <button type="submit" 
                            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            Update Patient
                        </button>
                    </div>
                </form>
            `;

            modal.classList.remove('hidden');
            modal.classList.add('flex');

            // Add form submission handler
            document.getElementById('editPatientForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.updatePatient(patientId);
            });

        } catch (error) {
            console.error('Error loading patient for edit:', error);
            this.showNotification('Error loading patient data', 'error');
        }
    }

    async updatePatient(patientId) {
        const form = document.getElementById('editPatientForm');
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Updating...';

            // Get current patient data to check for department change
            const patientDoc = await window.collections.patients.doc(patientId).get();
            const currentPatient = patientDoc.data();
            
            const newDepartmentId = document.getElementById('editDepartment').value;
            const departmentChanged = currentPatient.department !== newDepartmentId;

            const updateData = {
                firstName: document.getElementById('editFirstName').value,
                lastName: document.getElementById('editLastName').value,
                dateOfBirth: firebase.firestore.Timestamp.fromDate(
                    new Date(document.getElementById('editDateOfBirth').value)
                ),
                gender: document.getElementById('editGender').value,
                contactNumber: document.getElementById('editContactNumber').value,
                emergencyContact: document.getElementById('editEmergencyContact').value,
                chiefComplaint: document.getElementById('editChiefComplaint').value,
                medicalHistory: document.getElementById('editMedicalHistory').value,
                allergies: document.getElementById('editAllergies').value.split(',').map(a => a.trim()).filter(a => a),
                priority: document.getElementById('editPriority').value,
                status: document.getElementById('editStatus').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Handle department transfer
            if (departmentChanged && newDepartmentId) {
                const newDeptDoc = await window.collections.departments.doc(newDepartmentId).get();
                if (newDeptDoc.exists) {
                    const newDept = newDeptDoc.data();
                    updateData.department = newDepartmentId;
                    updateData.departmentName = newDept.name;
                    
                    // Release old bed if patient had one
                    if (currentPatient.bedId) {
                        await window.collections.beds.doc(currentPatient.bedId).update({
                            status: 'available',
                            patientId: null,
                            occupiedAt: null,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        
                        // Clear bed info from update data
                        updateData.bedId = null;
                        updateData.bedNumber = null;
                    }
                    
                    // Update department loads
                    if (currentPatient.department) {
                        await window.collections.departments.doc(currentPatient.department).update({
                            currentLoad: firebase.firestore.FieldValue.increment(-1)
                        });
                    }
                    await window.collections.departments.doc(newDepartmentId).update({
                        currentLoad: firebase.firestore.FieldValue.increment(1)
                    });

                    // Update active billing record
                    const billingSnapshot = await window.collections.patientBills
                        .where('patientId', '==', patientId)
                        .where('status', '==', 'active')
                        .get();
                    
                    if (!billingSnapshot.empty) {
                        const billDoc = billingSnapshot.docs[0];
                        await window.collections.patientBills.doc(billDoc.id).update({
                            departmentId: newDepartmentId,
                            departmentName: newDept.name,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }

                    // Log transfer activity
                    await window.collections.activities.add({
                        type: 'patient_transfer',
                        message: `Patient ${updateData.firstName} ${updateData.lastName} transferred from ${currentPatient.departmentName || 'Unknown'} to ${newDept.name}`,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        userId: this.currentUser.uid,
                        patientId: patientId
                    });

                    // Update patient first with cleared bed info
                    await window.collections.patients.doc(patientId).update(updateData);

                    // Try to assign bed in new department
                    const newBedAssignment = await this.assignBedToPatient(patientId, newDepartmentId);
                    if (newBedAssignment.success) {
                        this.showNotification(`Patient transferred to ${newDept.name} - Bed ${newBedAssignment.bedNumber} assigned`, 'success');
                    } else {
                        this.showNotification(`Patient transferred to ${newDept.name} - No bed available yet`, 'warning');
                    }
                    
                    // Skip the regular update below since we already updated
                    closeEditPatientModal();
                    this.filterPatients();
                    return;
                }
            }

            await window.collections.patients.doc(patientId).update(updateData);

            // Log activity
            await this.logActivity('patient_updated', 
                `Patient information updated: ${updateData.firstName} ${updateData.lastName}`);

            this.showNotification('Patient updated successfully!', 'success');
            closeEditPatientModal();
            
            // Refresh patient list by re-filtering
            this.filterPatients();

        } catch (error) {
            console.error('Error updating patient:', error);
            this.showNotification('Error updating patient. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Update Patient';
        }
    }

    async dischargePatient(patientId) {
        const modal = document.getElementById('dischargeModal');
        const form = document.getElementById('dischargeForm');

        // Store patient ID for form submission
        form.dataset.patientId = patientId;

        // Get patient details for confirmation
        try {
            const patientDoc = await window.collections.patients.doc(patientId).get();
            if (patientDoc.exists) {
                const patient = patientDoc.data();
                document.getElementById('dischargePatientName').textContent = 
                    `${patient.firstName} ${patient.lastName}`;
                document.getElementById('dischargePatientId').textContent = 
                    patient.patientId;
            }
        } catch (error) {
            console.error('Error loading patient details:', error);
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    async processDischarge() {
        const form = document.getElementById('dischargeForm');
        const submitBtn = form.querySelector('button[type="submit"]');
        const patientId = form.dataset.patientId;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Processing...';

            const dischargeData = {
                dischargeNotes: document.getElementById('dischargeNotes').value,
                dischargeCondition: document.getElementById('dischargeCondition').value,
                followUpRequired: document.getElementById('followUpRequired').checked,
                followUpDate: document.getElementById('followUpDate').value || null
            };

            // Get patient data first
            const patientDoc = await window.collections.patients.doc(patientId).get();
            if (!patientDoc.exists) {
                throw new Error('Patient not found');
            }

            const patient = patientDoc.data();

            // Update patient status
            await window.collections.patients.doc(patientId).update({
                status: 'discharged',
                dischargeNotes: dischargeData.dischargeNotes,
                dischargeCondition: dischargeData.dischargeCondition,
                followUpRequired: dischargeData.followUpRequired,
                followUpDate: dischargeData.followUpDate ? 
                    firebase.firestore.Timestamp.fromDate(new Date(dischargeData.followUpDate)) : null,
                dischargedAt: firebase.firestore.FieldValue.serverTimestamp(),
                dischargedBy: this.currentUser.uid
            });

            // Free up the bed if assigned
            if (patient.bedId) {
                await window.collections.beds.doc(patient.bedId).update({
                    status: 'available',
                    patientId: null,
                    occupiedAt: null
                });
            }

            // Update department load
            if (patient.department) {
                await window.collections.departments.doc(patient.department).update({
                    currentLoad: firebase.firestore.FieldValue.increment(-1)
                });
            }

            // Stop billing for the patient
            if (window.billingManager) {
                await window.billingManager.stopPatientBilling(patientId);
            }

            // Log activity
            await this.logActivity('patient_discharged', 
                `Patient discharged: ${patient.firstName} ${patient.lastName}`);

            this.showNotification('Patient discharged successfully!', 'success');
            closeDischargeModal();

        } catch (error) {
            console.error('Error discharging patient:', error);
            this.showNotification('Error discharging patient. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Discharge Patient';
        }
    }

    async processDischargeWithPayment(patientId, paymentStatus, paymentNotes) {
        try {
            // Get patient data
            const patientDoc = await window.collections.patients.doc(patientId).get();
            const patient = patientDoc.data();

            // Stop billing for the patient and update with payment status
            if (window.billingManager) {
                await window.billingManager.stopPatientBilling(patientId, new Date(), paymentStatus, paymentNotes);
                console.log('Billing stopped for patient:', patientId, 'Payment status:', paymentStatus);
            } else {
                console.warn('Billing manager not available, billing not stopped');
            }

            // Update patient status
            await window.collections.patients.doc(patientId).update({
                status: 'discharged',
                dischargedAt: firebase.firestore.FieldValue.serverTimestamp(),
                dischargedBy: this.currentUser.uid,
                paymentStatus: paymentStatus,
                paymentNotes: paymentNotes
            });

            // Free up bed
            if (patient.bedId) {
                await window.collections.beds.doc(patient.bedId).update({
                    status: 'available',
                    patientId: null,
                    lastCleaned: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            // Update department load
            if (patient.department) {
                await window.collections.departments.doc(patient.department).update({
                    currentLoad: firebase.firestore.FieldValue.increment(-1)
                });
            }

            // Log activity
            await this.logActivity('patient_discharged', 
                `Patient discharged: ${patient.firstName} ${patient.lastName} - Payment: ${paymentStatus}`);

            // Deallocate all patient resources
            await this.deallocatePatientResources(patientId);

            this.showNotification('Patient discharged successfully', 'success');
            
            // Close discharge modal and show confirmation with report options
            closeDischargeModal();
            this.showDischargeConfirmation(patientId, { ...patient, paymentStatus, paymentNotes });

        } catch (error) {
            console.error('Error discharging patient:', error);
            this.showNotification('Error discharging patient', 'error');
        }
    }

    async logActivity(type, description) {
        try {
            await window.collections.activities.add({
                type,
                description,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userId: this.currentUser.uid,
                userEmail: this.currentUser.email
            });
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transition-all duration-300 transform translate-x-full ${
            type === 'success' ? 'bg-green-500 text-white' :
            type === 'error' ? 'bg-red-500 text-white' :
            'bg-blue-500 text-white'
        }`;
        notification.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="ri-${type === 'success' ? 'check' : type === 'error' ? 'close' : 'information'}-line"></i>
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

    async loadPatientStatistics() {
        // This method will be called by the dashboard to load statistics
        if (typeof window.updateDashboardStats === 'function') {
            window.updateDashboardStats(this.patients);
        }
    }

    calculateLOS(admittedAt) {
        if (!admittedAt) return 0;
        const admitted = admittedAt.toDate();
        const now = new Date();
        const diff = now - admitted;
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    async loadPatientBilling(patientId) {
        try {
            // Get patient billing information
            const billingSnapshot = await window.collections.patientBills
                .where('patientId', '==', patientId)
                .get();
            
            const billingContainer = document.getElementById('patient-billing-content');
            if (!billingContainer) {
                console.warn('Billing container not found for patient:', patientId);
                return;
            }
            
            if (billingSnapshot.empty) {
                billingContainer.innerHTML = `
                    <div class="text-center text-gray-500 py-8">
                        <i class="ri-bill-line text-4xl mb-4"></i>
                        <p>No billing information found for this patient</p>
                    </div>
                `;
                return;
            }
            
            let activeBill = null;
            let completedBills = [];
            
            billingSnapshot.forEach(doc => {
                const bill = { id: doc.id, ...doc.data() };
                if (bill.status === 'active') {
                    activeBill = bill;
                } else {
                    completedBills.push(bill);
                }
            });
            
            let billingContent = '<h5 class="font-semibold text-gray-800 mb-4">Billing Information</h5>';
            
            // Show active billing
            if (activeBill) {
                const billingDuration = this.calculateBillingDuration(activeBill.billingStartTime);
                billingContent += `
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <div class="flex items-center justify-between mb-3">
                            <h6 class="font-medium text-blue-800">Current Billing Session</h6>
                            <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                                ACTIVE
                            </span>
                        </div>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p class="text-blue-600 font-medium">Department</p>
                                <p class="text-blue-800">${activeBill.departmentName || 'N/A'}</p>
                            </div>
                            <div>
                                <p class="text-blue-600 font-medium">Started</p>
                                <p class="text-blue-800">${activeBill.billingStartTime ? 
                                    new Date(activeBill.billingStartTime.toDate()).toLocaleString() : 'N/A'}</p>
                            </div>
                            <div>
                                <p class="text-blue-600 font-medium">Duration</p>
                                <p class="text-blue-800 font-semibold">${billingDuration}</p>
                                <p class="text-xs text-blue-600">${this.calculateTotalHours(activeBill.billingStartTime)} hours (${this.calculateMinutesFromStart(activeBill.billingStartTime)} min)</p>
                            </div>
                            <div>
                                <p class="text-blue-600 font-medium">Estimated Cost</p>
                                <p class="text-blue-800 font-semibold" id="estimated-cost">Calculating...</p>
                            </div>
                        </div>
                    </div>
                `;
                
                // Calculate estimated cost
                this.calculateEstimatedCost(patientId, activeBill);
            }
            
            // Show completed bills
            if (completedBills.length > 0) {
                billingContent += `
                    <div class="space-y-3">
                        <h6 class="font-medium text-gray-800">Previous Billing Records</h6>
                        ${completedBills.map(bill => `
                            <div class="bg-gray-50 rounded-lg p-4">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="font-medium text-gray-800">Bill #${bill.id.substring(0, 8)}</span>
                                    <span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                                        COMPLETED
                                    </span>
                                </div>
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                    <div>
                                        <p class="text-gray-500">Duration</p>
                                        <p class="font-medium">${bill.totalHours || 0} hours</p>
                                        ${bill.totalMinutes ? `<p class="text-xs text-gray-500">(${bill.totalMinutes} minutes)</p>` : ''}
                                    </div>
                                    <div>
                                        <p class="text-gray-500">Department</p>
                                        <p class="font-medium">${bill.departmentName || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p class="text-gray-500">Period</p>
                                        <p class="font-medium">${bill.billingStartTime ? 
                                            new Date(bill.billingStartTime.toDate()).toLocaleDateString() : 'N/A'} - 
                                            ${bill.billingEndTime ? 
                                            new Date(bill.billingEndTime.toDate()).toLocaleDateString() : 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p class="text-gray-500">Total Cost</p>
                                        <p class="font-semibold text-green-600">₹${bill.totalCost || 0}</p>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            
            billingContainer.innerHTML = billingContent;
            
        } catch (error) {
            console.error('Error loading patient billing:', error);
            const billingContainer = document.getElementById('patient-billing-content');
            if (billingContainer) {
                billingContainer.innerHTML = `
                    <div class="text-center text-red-500 py-8">
                        <i class="ri-error-warning-line text-4xl mb-4"></i>
                        <p>Error loading billing information</p>
                    </div>
                `;
            }
        }
    }

    calculateBillingDuration(startTime) {
        if (!startTime) return '0 minutes';
        const start = startTime.toDate();
        const now = new Date();
        const diff = now - start;
        const totalMinutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    calculateTotalHours(startTime) {
        if (!startTime) return '0.00';
        const start = startTime.toDate();
        const now = new Date();
        const totalMinutes = (now - start) / (1000 * 60); // Convert to minutes
        const totalHours = totalMinutes / 60; // Convert to fractional hours
        return totalHours.toFixed(2);
    }

    calculateMinutesFromStart(startTime) {
        if (!startTime) return '0';
        const start = startTime.toDate();
        const now = new Date();
        const totalMinutes = Math.floor((now - start) / (1000 * 60));
        return totalMinutes.toString();
    }

    async calculateEstimatedCost(patientId, activeBill) {
        try {
            // Get billing rate for the department
            const ratesSnapshot = await window.collections.billingRates
                .where('departmentId', '==', activeBill.departmentId)
                .where('isActive', '==', true)
                .get();
            
            if (!ratesSnapshot.empty) {
                const rate = ratesSnapshot.docs[0].data();
                const startTime = activeBill.billingStartTime.toDate();
                const currentTime = new Date();
                const totalMinutes = (currentTime - startTime) / (1000 * 60); // Total minutes
                const totalHours = totalMinutes / 60; // Convert to fractional hours
                const estimatedCost = (totalHours * rate.hourlyRate);
                
                const costElement = document.getElementById('estimated-cost');
                if (costElement) {
                    costElement.innerHTML = `
                        <span class="text-lg font-bold">₹${estimatedCost.toFixed(2)}</span><br>
                        <span class="text-xs text-blue-600">₹${rate.hourlyRate}/hr × ${totalHours.toFixed(3)}h</span>
                    `;
                }
            }
        } catch (error) {
            console.error('Error calculating estimated cost:', error);
        }
    }

    showDischargeConfirmation(patientId, patient) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
                <div class="p-6">
                    <div class="text-center mb-6">
                        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="ri-check-line text-green-600 text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-semibold text-gray-800 mb-2">Patient Discharged Successfully</h3>
                        <p class="text-gray-600">${patient.firstName} ${patient.lastName} has been discharged</p>
                        
                        <!-- Payment Status Display -->
                        <div class="mt-4 p-3 rounded-lg ${
                            patient.paymentStatus === 'paid' ? 'bg-green-50 border border-green-200' :
                            patient.paymentStatus === 'pending' ? 'bg-orange-50 border border-orange-200' :
                            patient.paymentStatus === 'partial' ? 'bg-yellow-50 border border-yellow-200' :
                            'bg-blue-50 border border-blue-200'
                        }">
                            <div class="flex items-center justify-center">
                                <i class="${
                                    patient.paymentStatus === 'paid' ? 'ri-check-line text-green-600' :
                                    patient.paymentStatus === 'pending' ? 'ri-time-line text-orange-600' :
                                    patient.paymentStatus === 'partial' ? 'ri-money-dollar-circle-line text-yellow-600' :
                                    'ri-shield-check-line text-blue-600'
                                } mr-2"></i>
                                <span class="font-medium ${
                                    patient.paymentStatus === 'paid' ? 'text-green-700' :
                                    patient.paymentStatus === 'pending' ? 'text-orange-700' :
                                    patient.paymentStatus === 'partial' ? 'text-yellow-700' :
                                    'text-blue-700'
                                }">Payment Status: ${patient.paymentStatus?.toUpperCase()}</span>
                            </div>
                            ${patient.paymentNotes ? `
                                <p class="text-sm text-gray-600 mt-2">${patient.paymentNotes}</p>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="space-y-3">
                        <button onclick="generateDischargeReport('${patientId}')" 
                            class="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition flex items-center justify-center">
                            <i class="ri-file-text-line mr-2"></i>
                            Generate Discharge Report with Billing
                        </button>
                        
                        <button onclick="printDischargeReport('${patientId}')" 
                            class="w-full border border-gray-300 px-4 py-3 rounded-lg hover:bg-gray-50 transition flex items-center justify-center">
                            <i class="ri-printer-line mr-2"></i>
                            Print Discharge Summary
                        </button>
                        
                        <button onclick="closeDischargeConfirmationModal()" 
                            class="w-full text-gray-600 px-4 py-2 rounded-lg hover:text-gray-800 transition">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        window.currentDischargeConfirmationModal = modal;
    }

    // ===== RESOURCE ALLOCATION INTEGRATION =====
    
    async allocateResourceToPatient(patientId, resourceType, resourceKey, quantity) {
        try {
            const patientDoc = await window.collections.patients.doc(patientId).get();
            if (!patientDoc.exists) {
                throw new Error('Patient not found');
            }
            
            const patient = patientDoc.data();
            const departmentId = patient.department;
            
            if (!departmentId) {
                throw new Error('Patient department not assigned');
            }
            
            // Use global resource manager if available
            if (window.resourceManager) {
                await window.resourceManager.allocateResourceToPatient(
                    patientId, resourceType, resourceKey, quantity, departmentId
                );
                this.showNotification(`Resource allocated: ${resourceKey}`, 'success');
                return true;
            } else {
                throw new Error('Resource manager not available');
            }
        } catch (error) {
            console.error('Error allocating resource:', error);
            this.showNotification(error.message, 'error');
            return false;
        }
    }
    
    async deallocatePatientResources(patientId) {
        try {
            const patientDoc = await window.collections.patients.doc(patientId).get();
            if (!patientDoc.exists) {
                return;
            }
            
            const patient = patientDoc.data();
            const departmentId = patient.department;
            
            if (!departmentId) {
                throw new Error('Patient department not assigned');
            }
            
            // Use global resource manager if available
            if (window.resourceManager) {
                await window.resourceManager.deallocatePatientResources(patientId, departmentId);
                this.showNotification('Patient resources deallocated', 'success');
                return true;
            } else {
                throw new Error('Resource manager not available');
            }
        } catch (error) {
            console.error('Error deallocating patient resources:', error);
            this.showNotification(error.message, 'error');
            return false;
        }
    }

    showDischargeModal(patientId, patient) {
        // Remove existing modal if any
        const existingModal = document.getElementById('dischargeModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'dischargeModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-lg max-w-md w-full">
                <div class="p-6">
                    <div class="flex items-center mb-6">
                        <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
                            <i class="ri-logout-box-r-line text-green-600 text-xl"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-semibold text-gray-800">Discharge Patient</h3>
                            <p class="text-gray-600">${patient.firstName} ${patient.lastName}</p>
                        </div>
                    </div>

                    <div class="space-y-4">
                        <!-- Patient Summary -->
                        <div class="bg-gray-50 rounded-lg p-4">
                            <div class="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p class="text-gray-600">Patient ID</p>
                                    <p class="font-medium">${patient.patientId || patientId.substring(0, 8)}</p>
                                </div>
                                <div>
                                    <p class="text-gray-600">Department</p>
                                    <p class="font-medium">${patient.departmentName || 'N/A'}</p>
                                </div>
                                <div>
                                    <p class="text-gray-600">Bed</p>
                                    <p class="font-medium">${patient.bedNumber || 'N/A'}</p>
                                </div>
                                <div>
                                    <p class="text-gray-600">Admitted</p>
                                    <p class="font-medium">${patient.admittedAt ? 
                                        new Date(patient.admittedAt.toDate()).toLocaleDateString() : 'N/A'}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Payment Status Selection -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-3">Payment Status</label>
                            <div class="space-y-2">
                                <label class="flex items-center">
                                    <input type="radio" name="paymentStatus" value="paid" 
                                        class="mr-3 text-green-600 focus:ring-green-500" checked>
                                    <div class="flex items-center">
                                        <i class="ri-check-line text-green-600 mr-2"></i>
                                        <span class="text-green-700 font-medium">Paid</span>
                                        <span class="text-gray-600 ml-2">- All bills have been settled</span>
                                    </div>
                                </label>
                                <label class="flex items-center">
                                    <input type="radio" name="paymentStatus" value="pending" 
                                        class="mr-3 text-orange-600 focus:ring-orange-500">
                                    <div class="flex items-center">
                                        <i class="ri-time-line text-orange-600 mr-2"></i>
                                        <span class="text-orange-700 font-medium">Pending</span>
                                        <span class="text-gray-600 ml-2">- Payment to be collected later</span>
                                    </div>
                                </label>
                                <label class="flex items-center">
                                    <input type="radio" name="paymentStatus" value="partial" 
                                        class="mr-3 text-yellow-600 focus:ring-yellow-500">
                                    <div class="flex items-center">
                                        <i class="ri-money-dollar-circle-line text-yellow-600 mr-2"></i>
                                        <span class="text-yellow-700 font-medium">Partial Payment</span>
                                        <span class="text-gray-600 ml-2">- Partial amount received</span>
                                    </div>
                                </label>
                                <label class="flex items-center">
                                    <input type="radio" name="paymentStatus" value="insurance" 
                                        class="mr-3 text-blue-600 focus:ring-blue-500">
                                    <div class="flex items-center">
                                        <i class="ri-shield-check-line text-blue-600 mr-2"></i>
                                        <span class="text-blue-700 font-medium">Insurance Claim</span>
                                        <span class="text-gray-600 ml-2">- To be claimed from insurance</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Payment Notes -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Payment Notes (Optional)</label>
                            <textarea id="paymentNotes" rows="3" 
                                placeholder="Add any payment-related notes or details..."
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none text-sm"></textarea>
                        </div>

                        <!-- Warning -->
                        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <div class="flex">
                                <i class="ri-alert-line text-yellow-600 mr-2 mt-0.5"></i>
                                <div class="text-sm">
                                    <p class="text-yellow-800 font-medium">Discharge Confirmation</p>
                                    <p class="text-yellow-700">This will stop billing, free up the bed, and generate discharge summary.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-end space-x-3 pt-6 border-t mt-6">
                        <button onclick="closeDischargeModal()" 
                            class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                            Cancel
                        </button>
                        <button onclick="processDischarge('${patientId}')" 
                            class="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center">
                            <i class="ri-logout-box-r-line mr-2"></i>
                            Discharge Patient
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeDischargeModal();
            }
        });
    }

    // Cleanup method to remove Firebase listeners
    cleanup() {
        this.listeners.forEach(unsubscribe => unsubscribe());
    }
}

// Global functions for HTML event handlers
function viewPatientDetails(patientId) {
    if (window.patientManager) {
        window.patientManager.viewPatientDetails(patientId);
    }
}

function editPatient(patientId) {
    if (window.patientManager) {
        window.patientManager.editPatient(patientId);
    }
}

function dischargePatient(patientId) {
    if (window.patientManager) {
        window.patientManager.dischargePatient(patientId);
    }
}

function allocateResources(patientId) {
    // Instead of redirecting to resources page, show resource allocation on the same page
    showResourceAllocationOnPage(patientId);
}

function closePatientDetailsModal() {
    const modal = document.getElementById('patientDetailsModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function closeEditPatientModal() {
    const modal = document.getElementById('editPatientModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function closeDischargeModal() {
    const modal = document.getElementById('dischargeModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function showPatientTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Show selected tab content
    document.getElementById(`${tabName}-tab`).classList.remove('hidden');

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('border-blue-600', 'text-blue-600');
        btn.classList.add('border-transparent', 'text-gray-500');
    });

    event.target.classList.add('border-blue-600', 'text-blue-600');
    event.target.classList.remove('border-transparent', 'text-gray-500');
}

function recordNewVitals(patientId) {
    // Implementation for recording new vitals
    console.log('Record new vitals for patient:', patientId);
    // This would open a modal for recording vitals
}

function selectAlternativeDepartment(departmentId, departmentName) {
    if (window.currentPatientData && window.patientManager) {
        // Update patient data with alternative department
        window.currentPatientData.department = departmentId;
        window.currentPatientData.departmentName = departmentName;
        
        // Close alternatives modal
        if (window.bedAlternativesModal) {
            document.body.removeChild(window.bedAlternativesModal);
            window.bedAlternativesModal = null;
        }
        
        // Retry patient admission with alternative department
        window.patientManager.addPatientWithAlternative(window.currentPatientData);
    }
}

function closeBedAlternativesModal() {
    if (window.bedAlternativesModal) {
        document.body.removeChild(window.bedAlternativesModal);
        window.bedAlternativesModal = null;
        window.currentPatientData = null;
    }
}

async function shiftBedFromDepartment(targetDepartmentId, patientId) {
    try {
        if (!window.patientManager) {
            alert('Patient manager not available');
            return;
        }

        // Show loading state
        window.patientManager.showNotification('Searching for available beds to shift...', 'info');

        // Get target department info
        const targetDeptDoc = await window.collections.departments.doc(targetDepartmentId).get();
        if (!targetDeptDoc.exists) {
            window.patientManager.showNotification('Target department not found', 'error');
            return;
        }
        const targetDeptData = targetDeptDoc.data();

        // Find departments with available beds
        const departmentsSnapshot = await window.collections.departments.get();
        const availableDepartments = [];

        for (const deptDoc of departmentsSnapshot.docs) {
            if (deptDoc.id === targetDepartmentId) continue;

            const availableBeds = await window.collections.beds
                .where('departmentId', '==', deptDoc.id)
                .where('status', '==', 'available')
                .get();

            if (availableBeds.size > 0) {
                availableDepartments.push({
                    id: deptDoc.id,
                    name: deptDoc.data().name,
                    availableBeds: availableBeds.size,
                    beds: availableBeds.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                });
            }
        }

        if (availableDepartments.length === 0) {
            window.patientManager.showNotification('No available beds found in any department to shift', 'error');
            return;
        }

        // Show bed selection modal
        showBedShiftSelectionModal(availableDepartments, targetDepartmentId, targetDeptData.name, patientId);

    } catch (error) {
        console.error('Error shifting bed:', error);
        if (window.patientManager) {
            window.patientManager.showNotification('Error shifting bed: ' + error.message, 'error');
        }
    }
}

function showBedShiftSelectionModal(departments, targetDepartmentId, targetDepartmentName, patientId) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 class="text-xl font-semibold text-gray-800 mb-4">
                <i class="ri-arrow-left-right-line text-orange-500 mr-2"></i>
                Select Bed to Shift to ${targetDepartmentName}
            </h3>
            <p class="text-gray-600 mb-6">Choose an available bed from another department to transfer to ${targetDepartmentName}.</p>
            
            <div class="space-y-4">
                ${departments.map(dept => `
                    <div class="border border-gray-200 rounded-lg p-4">
                        <h4 class="font-semibold text-gray-800 mb-3">${dept.name} (${dept.availableBeds} available)</h4>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                            ${dept.beds.map(bed => `
                                <button onclick="confirmBedShift('${bed.id}', '${bed.bedNumber}', '${dept.id}', '${dept.name}', '${targetDepartmentId}', '${targetDepartmentName}', '${patientId}')"
                                        class="px-3 py-2 border border-blue-300 rounded hover:bg-blue-50 text-blue-700 text-sm font-medium transition">
                                    <i class="ri-hotel-bed-line mr-1"></i>
                                    ${bed.bedNumber}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="flex justify-end space-x-3 mt-6">
                <button onclick="closeBedShiftModal()" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    window.bedShiftModal = modal;
}

async function confirmBedShift(bedId, bedNumber, sourceDeptId, sourceDeptName, targetDeptId, targetDeptName, patientId) {
    try {
        if (!window.patientManager) {
            alert('Patient manager not available');
            return;
        }

        // Show loading
        window.patientManager.showNotification('Shifting bed...', 'info');

        // Update bed's department
        await window.collections.beds.doc(bedId).update({
            departmentId: targetDeptId,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Now assign this bed to the patient
        await window.db.runTransaction(async (tx) => {
            tx.update(window.collections.beds.doc(bedId), {
                status: 'occupied',
                patientId: patientId,
                occupiedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            tx.update(window.collections.patients.doc(patientId), {
                bedId: bedId,
                bedNumber: bedNumber
            });
        });

        // Log activity
        await window.collections.activities.add({
            type: 'bed_transfer',
            message: `Bed ${bedNumber} shifted from ${sourceDeptName} to ${targetDeptName} for patient`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            userId: window.auth.currentUser?.uid,
            patientId: patientId
        });

        window.patientManager.showNotification(`Bed ${bedNumber} successfully shifted to ${targetDeptName} and assigned to patient`, 'success');
        
        // Close modals
        closeBedShiftModal();
        closeBedAlternativesModal();
        closeAddPatientModal();

        // Refresh patient list
        window.patientManager.filterPatients();

    } catch (error) {
        console.error('Error confirming bed shift:', error);
        if (window.patientManager) {
            window.patientManager.showNotification('Error shifting bed: ' + error.message, 'error');
        }
    }
}

function closeBedShiftModal() {
    if (window.bedShiftModal) {
        document.body.removeChild(window.bedShiftModal);
        window.bedShiftModal = null;
    }
}

// Additional utility functions
function openAddPatientModal() {
    document.getElementById('addPatientModal').classList.remove('hidden');
}

function closeAddPatientModal() {
    document.getElementById('addPatientModal').classList.add('hidden');
    document.getElementById('addPatientForm').reset();
}

function previousPage() {
    if (window.patientManager && window.patientManager.currentPage > 1) {
        window.patientManager.currentPage--;
        window.patientManager.renderPatientTable();
    }
}

function nextPage() {
    if (window.patientManager) {
        const maxPage = Math.ceil(window.patientManager.filteredPatients.length / window.patientManager.itemsPerPage);
        if (window.patientManager.currentPage < maxPage) {
            window.patientManager.currentPage++;
            window.patientManager.renderPatientTable();
        }
    }
}

function exportPatientData() {
    if (window.patientManager) {
        const data = window.patientManager.filteredPatients.map(patient => ({
            'Patient ID': patient.patientId,
            'Name': `${patient.firstName} ${patient.lastName}`,
            'Age': window.patientManager.calculateAge(patient.dateOfBirth),
            'Gender': patient.gender,
            'Department': patient.departmentName,
            'Bed': patient.bedNumber || 'Unassigned',
            'Priority': patient.priority,
            'Status': patient.status,
            'Admitted': patient.admittedAt ? new Date(patient.admittedAt.toDate()).toLocaleDateString() : 'N/A'
        }));

        const csv = convertToCSV(data);
        downloadCSV(csv, `patients_${new Date().toISOString().split('T')[0]}.csv`);
    }
}

function refreshPatientList() {
    location.reload();
}

function closeRecordVitalsModal() {
    document.getElementById('recordVitalsModal').classList.add('hidden');
}

function printPatientInfo(patientId) {
    window.print();
}

async function updatePatient(patientId) {
    if (!window.patientManager) return;
    
    const doc = await window.collections.patients.doc(patientId).get();
    if (!doc.exists) return;
    const p = doc.data();
    document.getElementById('updatePatientId').value = patientId;
    document.getElementById('upd_priority').value = p.priority || 'low';
    document.getElementById('upd_status').value = p.status || 'active';
    document.getElementById('upd_cc').value = p.chiefComplaint || '';
    document.getElementById('upd_dischargeReady').checked = !!p.dischargeReady;
    document.getElementById('updatePatientModal').classList.remove('hidden');
}

function closeUpdatePatientModal() {
    document.getElementById('updatePatientModal').classList.add('hidden');
}

function closeDischargeConfirmationModal() {
    if (window.currentDischargeConfirmationModal) {
        window.currentDischargeConfirmationModal.remove();
        window.currentDischargeConfirmationModal = null;
    }
}

async function generateDischargeReport(patientId) {
    try {
        // Generate detailed patient report with billing information
        if (window.reportsManager) {
            await window.reportsManager.generateDetailedPatientReport(patientId);
        } else if (typeof generateDetailedPatientReport !== 'undefined') {
            await generateDetailedPatientReport(patientId);
        } else {
            console.error('Reports manager not available');
            if (window.patientManager) {
                window.patientManager.showNotification('Reports system not available', 'error');
            }
        }
        
        closeDischargeConfirmationModal();
    } catch (error) {
        console.error('Error generating discharge report:', error);
        if (window.patientManager) {
            window.patientManager.showNotification('Error generating discharge report', 'error');
        }
    }
}

async function printDischargeReport(patientId) {
    try {
        // Get patient and billing data for printing
        const patientDoc = await window.collections.patients.doc(patientId).get();
        if (!patientDoc.exists) {
            if (window.patientManager) {
                window.patientManager.showNotification('Patient not found', 'error');
            }
            return;
        }
        
        const patient = { id: patientDoc.id, ...patientDoc.data() };
        
        // Get billing information
        const billingSnapshot = await window.collections.patientBills
            .where('patientId', '==', patientId)
            .get();
        
        let totalCost = 0;
        let billingDetails = [];
        
        billingSnapshot.forEach(doc => {
            const bill = doc.data();
            if (bill.totalCost) {
                totalCost += bill.totalCost;
            }
            billingDetails.push(bill);
        });
        
        // Create print content
        const printContent = `
            <div style="padding: 20px; font-family: Arial, sans-serif;">
                <h1 style="text-align: center; margin-bottom: 20px;">DISCHARGE SUMMARY</h1>
                
                <div style="margin-bottom: 20px;">
                    <h2>Patient Information</h2>
                    <p><strong>Name:</strong> ${patient.firstName} ${patient.lastName}</p>
                    <p><strong>Patient ID:</strong> ${patient.patientId}</p>
                    <p><strong>Department:</strong> ${patient.departmentName}</p>
                    <p><strong>Admitted:</strong> ${patient.admittedAt ? new Date(patient.admittedAt.toDate()).toLocaleString() : 'N/A'}</p>
                    <p><strong>Discharged:</strong> ${patient.dischargedAt ? new Date(patient.dischargedAt.toDate()).toLocaleString() : 'N/A'}</p>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h2>Billing Summary</h2>
                    <p><strong>Total Hospital Charges:</strong> $${totalCost.toFixed(2)}</p>
                    <p><strong>Length of Stay:</strong> ${window.patientManager ? window.patientManager.calculateLOS(patient.admittedAt) : 0} days</p>
                </div>
                
                <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #666;">
                    <p>Generated on ${new Date().toLocaleString()}</p>
                    <p>Smart Hospital Management System</p>
                </div>
            </div>
        `;
        
        // Create print window
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Discharge Summary - ${patient.firstName} ${patient.lastName}</title>
                </head>
                <body>
                    ${printContent}
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
        
        closeDischargeConfirmationModal();
        
    } catch (error) {
        console.error('Error printing discharge report:', error);
        if (window.patientManager) {
            window.patientManager.showNotification('Error printing discharge report', 'error');
        }
    }
}

// CSV export utilities
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

// Resource allocation functions
async function showResourceAllocationOnPage(patientId) {
    // Create a modal-like interface on the same page
    const container = document.createElement('div');
    container.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    container.innerHTML = `
        <div class="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div class="p-6 border-b">
                <div class="flex items-center justify-between">
                    <h3 class="text-xl font-semibold text-gray-800">Resource Allocation</h3>
                    <button onclick="closeResourceAllocation()" class="text-gray-500 hover:text-gray-700">
                        <i class="ri-close-line text-xl"></i>
                    </button>
                </div>
            </div>
            
            <div class="p-6">
                <div id="resourceAllocationContent">
                    <p class="text-center py-8 text-gray-500">
                        <i class="ri-loader-4-line animate-spin text-2xl"></i>
                        <br>Loading resource allocation interface...
                    </p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(container);
    window.resourceAllocationContainer = container;
    
    // Load resource allocation content
    loadResourceAllocationContent(patientId);
}

async function loadResourceAllocationContent(patientId) {
    try {
        // Get patient details
        const patientDoc = await window.collections.patients.doc(patientId).get();
        if (!patientDoc.exists) {
            document.getElementById('resourceAllocationContent').innerHTML = `
                <div class="text-center py-8">
                    <p class="text-red-600">Patient not found</p>
                </div>
            `;
            return;
        }
        
        const patient = patientDoc.data();
        
        // Display patient info and resource allocation interface
        document.getElementById('resourceAllocationContent').innerHTML = `
            <div class="mb-6 p-4 bg-blue-50 rounded-lg">
                <h4 class="font-semibold text-blue-800">Allocating resources for:</h4>
                <p class="text-blue-600">${patient.firstName} ${patient.lastName} - ${patient.departmentName || 'Unknown Department'}</p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="border rounded-lg p-4">
                    <h5 class="font-semibold mb-3">Assign Equipment</h5>
                    <div class="space-y-3">
                        <div class="flex items-center justify-between">
                            <span>Ventilator</span>
                            <button onclick="assignResource('${patientId}', 'ventilator')" class="bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200">
                                Assign
                            </button>
                        </div>
                        <div class="flex items-center justify-between">
                            <span>Monitor</span>
                            <button onclick="assignResource('${patientId}', 'monitor')" class="bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200">
                                Assign
                            </button>
                        </div>
                        <div class="flex items-center justify-between">
                            <span>IV Pump</span>
                            <button onclick="assignResource('${patientId}', 'iv_pump')" class="bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200">
                                Assign
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="border rounded-lg p-4">
                    <h5 class="font-semibold mb-3">Assign Bed</h5>
                    <div class="space-y-3">
                        <div class="flex items-center justify-between">
                            <span>ICU Bed</span>
                            <button onclick="assignBed('${patientId}', 'icu')" class="bg-green-100 text-green-700 px-3 py-1 rounded hover:bg-green-200">
                                Assign
                            </button>
                        </div>
                        <div class="flex items-center justify-between">
                            <span>General Ward Bed</span>
                            <button onclick="assignBed('${patientId}', 'general')" class="bg-green-100 text-green-700 px-3 py-1 rounded hover:bg-green-200">
                                Assign
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="mt-6 flex justify-end space-x-3">
                <button onclick="closeResourceAllocation()" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Close
                </button>
            </div>
        `;
    } catch (error) {
        console.error('Error loading resource allocation content:', error);
        document.getElementById('resourceAllocationContent').innerHTML = `
            <div class="text-center py-8">
                <p class="text-red-600">Error loading resource allocation interface</p>
                <button onclick="closeResourceAllocation()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Close
                </button>
            </div>
        `;
    }
}

function closeResourceAllocation() {
    if (window.resourceAllocationContainer) {
        window.resourceAllocationContainer.remove();
        window.resourceAllocationContainer = null;
    }
}

async function assignResource(patientId, resourceType) {
    try {
        // In a real implementation, this would assign the resource to the patient
        // For now, we'll just show a notification
        if (!window.patientManager) {
            alert('Resource assigned successfully!');
            return;
        }
        
        window.patientManager.showNotification(`Resource assigned: ${resourceType}`, 'success');
    } catch (error) {
        console.error('Error assigning resource:', error);
        if (window.patientManager) {
            window.patientManager.showNotification('Error assigning resource', 'error');
        }
    }
}

async function assignBed(patientId, bedType) {
    try {
        // In a real implementation, this would assign a bed to the patient
        // For now, we'll just show a notification
        if (!window.patientManager) {
            alert('Bed assigned successfully!');
            return;
        }
        
        window.patientManager.showNotification(`Bed assigned: ${bedType}`, 'success');
    } catch (error) {
        console.error('Error assigning bed:', error);
        if (window.patientManager) {
            window.patientManager.showNotification('Error assigning bed', 'error');
        }
    }
}

// Process discharge function for global use
function processDischarge(patientId) {
    if (window.patientManager) {
        const paymentStatus = document.querySelector('input[name="paymentStatus"]:checked')?.value || 'pending';
        const paymentNotes = document.getElementById('paymentNotes')?.value || '';
        
        // Call the enhanced processDischarge method
        window.patientManager.processDischargeWithPayment(patientId, paymentStatus, paymentNotes);
    }
}

// Event listeners for forms
document.addEventListener('DOMContentLoaded', () => {
    // Record vitals form
    const vitalsForm = document.getElementById('recordVitalsForm');
    if (vitalsForm) {
        vitalsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pid = document.getElementById('vitalsPatientId').value;
            await window.collections.vitals.add({
                patientId: pid,
                recordedAt: firebase.firestore.FieldValue.serverTimestamp(),
                recordedBy: window.auth.currentUser?.uid || '',
                vitals: {
                    bloodPressure: document.getElementById('v_bp').value,
                    heartRate: document.getElementById('v_hr').value,
                    temperature: document.getElementById('v_temp').value,
                    oxygenSaturation: document.getElementById('v_spo2').value,
                    respiratoryRate: document.getElementById('v_rr').value
                }
            });
            closeRecordVitalsModal();
            if (window.patientManager) {
                window.patientManager.showNotification('Vitals recorded', 'success');
            }
        });
    }

    // Update patient form
    const updateForm = document.getElementById('updatePatientForm');
    if (updateForm) {
        updateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('updatePatientId').value;
            const updates = {
                priority: document.getElementById('upd_priority').value,
                status: document.getElementById('upd_status').value,
                chiefComplaint: document.getElementById('upd_cc').value,
                dischargeReady: document.getElementById('upd_dischargeReady').checked,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await window.collections.patients.doc(id).update(updates);
            closeUpdatePatientModal();
            if (window.patientManager) {
                window.patientManager.showNotification('Patient updated', 'success');
            }
        });
    }
});

// Initialize PatientManager when DOM is loaded
let patientManager;
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Firebase to be ready
    const initializePatientManager = () => {
        if (window.collections && window.collections.patients && window.auth && window.db) {
            console.log('Firebase initialized successfully, creating PatientManager');
            patientManager = new PatientManager();
            window.patientManager = patientManager;
        } else {
            console.log('Waiting for Firebase initialization...');
            // Retry after a short delay
            setTimeout(initializePatientManager, 100);
        }
    };
    
    initializePatientManager();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (patientManager) {
        patientManager.cleanup();
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PatientManager };
}   