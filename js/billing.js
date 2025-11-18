// Billing and Cost Management System
class BillingManager {
    constructor() {
        this.currentUser = null;
        this.billingRates = {};
        this.patientBills = [];
    }

    async initialize() {
        await this.checkAuth();
        await this.loadBillingRates();
        await this.loadPatientBills();
    }

    async checkAuth() {
        return new Promise((resolve) => {
            firebase.auth().onAuthStateChanged(async (user) => {
                this.currentUser = user;
                if (user) {
                    await this.checkAdminAccess();
                }
                resolve();
            });
        });
    }

    async checkAdminAccess() {
        const userDoc = await window.collections.users.doc(this.currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.role !== 'administrator') {
                document.querySelectorAll('.admin-only').forEach(el => {
                    el.style.display = 'none';
                });
            }
        }
    }

    async loadBillingRates() {
        try {
            const snapshot = await window.collections.billingRates.get();
            this.billingRates = {};
            snapshot.forEach(doc => {
                this.billingRates[doc.id] = { id: doc.id, ...doc.data() };
            });
        } catch (error) {
            console.error('Error loading billing rates:', error);
        }
    }

    async loadPatientBills() {
        try {
            const snapshot = await window.collections.patientBills.get();
            this.patientBills = [];
            snapshot.forEach(doc => {
                this.patientBills.push({ id: doc.id, ...doc.data() });
            });
        } catch (error) {
            console.error('Error loading patient bills:', error);
        }
    }

    async loadDepartmentsIntoSelect() {
        try {
            const select = document.getElementById('departmentId');
            const nameInput = document.getElementById('departmentName');
            if (!select) {
                console.warn('Department select element not found');
                return;
            }

            // Clear existing and show loading
            select.innerHTML = '<option value="">Loading departments...</option>';

            // Check if collections are available
            if (!window.collections || !window.collections.departments) {
                console.warn('Firebase collections not ready yet');
                select.innerHTML = '<option value="">Database not ready...</option>';
                return;
            }

            let snapshot = await window.collections.departments.get();

            // If no departments exist, create default ones
            if (snapshot.empty) {
                console.log('No departments found, creating default departments...');
                await this.createDefaultDepartments();
                snapshot = await window.collections.departments.get();
            }

            const renderFromSnapshot = (snap) => {
                select.innerHTML = '<option value="">Select Department</option>';
                if (!snap.empty) {
                    const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    docs.forEach(d => {
                        const opt = document.createElement('option');
                        opt.value = d.id;
                        opt.textContent = d.name || d.code || 'Unnamed Department';
                        opt.dataset.departmentName = d.name || d.code || '';
                        select.appendChild(opt);
                    });
                    console.log(`Loaded ${docs.length} departments successfully`);
                } else {
                    // Show explicit empty state
                    const opt = document.createElement('option');
                    opt.value = '';
                    opt.textContent = 'No departments found';
                    opt.disabled = true;
                    select.appendChild(opt);
                }
            };

            renderFromSnapshot(snapshot);

            // Set up realtime listener
            if (!this._deptUnsub) {
                this._deptUnsub = window.collections.departments.onSnapshot(
                    renderFromSnapshot, 
                    (err) => {
                        console.error('Realtime departments error:', err);
                        this.showNotification('Error loading departments', 'error');
                    }
                );
            }

            // Update name field when department is selected
            select.onchange = () => {
                const option = select.options[select.selectedIndex];
                if (nameInput && option) {
                    nameInput.value = option.dataset.departmentName || option.textContent;
                }
            };

        } catch (error) {
            console.error('Error loading departments:', error);
            const select = document.getElementById('departmentId');
            if (select) {
                select.innerHTML = '<option value="">Error loading departments</option>';
            }
            this.showNotification('Error loading departments', 'error');
        }
    }

    async createDefaultDepartments() {
        try {
            const defaultDepartments = [
                { name: 'Emergency', code: 'ER', capacity: 20, currentLoad: 0 },
                { name: 'Intensive Care Unit', code: 'ICU', capacity: 15, currentLoad: 0 },
                { name: 'General Ward', code: 'GW', capacity: 50, currentLoad: 0 },
                { name: 'Pediatrics', code: 'PED', capacity: 25, currentLoad: 0 },
                { name: 'Surgery', code: 'SUR', capacity: 10, currentLoad: 0 },
                { name: 'Cardiology', code: 'CAR', capacity: 12, currentLoad: 0 },
                { name: 'Neurology', code: 'NEU', capacity: 8, currentLoad: 0 },
                { name: 'Orthopedics', code: 'ORT', capacity: 15, currentLoad: 0 },
                { name: 'Maternity', code: 'MAT', capacity: 20, currentLoad: 0 },
                { name: 'Oncology', code: 'ONC', capacity: 18, currentLoad: 0 }
            ];

            const batch = firebase.firestore().batch();
            
            defaultDepartments.forEach(dept => {
                const docRef = window.collections.departments.doc();
                batch.set(docRef, {
                    ...dept,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: this.currentUser ? this.currentUser.uid : 'system'
                });
            });

            await batch.commit();
            console.log('Default departments created successfully');
            this.showNotification('Default departments created', 'success');
        } catch (error) {
            console.error('Error creating default departments:', error);
            this.showNotification('Error creating default departments', 'error');
        }
    }

    async createBillingRate(departmentId, departmentName, hourlyRate) {
        try {
            const billingRate = {
                departmentId: departmentId,
                departmentName: departmentName,
                hourlyRate: parseFloat(hourlyRate),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: this.currentUser.uid,
                isActive: true
            };

            await window.collections.billingRates.add(billingRate);
            await this.loadBillingRates();
            this.showNotification('Billing rate created successfully', 'success');
        } catch (error) {
            console.error('Error creating billing rate:', error);
            this.showNotification('Error creating billing rate', 'error');
        }
    }

    async updateBillingRate(rateId, hourlyRate) {
        try {
            await window.collections.billingRates.doc(rateId).update({
                hourlyRate: parseFloat(hourlyRate),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: this.currentUser.uid
            });
            await this.loadBillingRates();
            this.showNotification('Billing rate updated successfully', 'success');
        } catch (error) {
            console.error('Error updating billing rate:', error);
            this.showNotification('Error updating billing rate', 'error');
        }
    }

    async startPatientBilling(patientId, departmentId, admissionTime) {
        try {
            // Get department information with better error handling
            let departmentName = 'N/A';
            if (departmentId) {
                try {
                    const deptDoc = await window.collections.departments.doc(departmentId).get();
                    if (deptDoc.exists) {
                        const deptData = deptDoc.data();
                        departmentName = deptData.name || deptData.code || 'Unknown Department';
                        console.log('Department resolved:', { id: departmentId, name: departmentName });
                    } else {
                        console.warn('Department not found:', departmentId);
                        departmentName = 'Department Not Found';
                    }
                } catch (deptError) {
                    console.error('Error fetching department:', deptError);
                    departmentName = 'Error Loading Department';
                }
            } else {
                console.warn('No department ID provided for billing');
                departmentName = 'No Department Assigned';
            }

            const billingRecord = {
                patientId: patientId,
                departmentId: departmentId,
                departmentName: departmentName,
                admissionTime: admissionTime,
                billingStartTime: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active',
                totalHours: 0,
                totalCost: 0,
                totalMinutes: 0, // Add minutes tracking from start
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: this.currentUser.uid
            };

            await window.collections.patientBills.add(billingRecord);
            await this.loadPatientBills();
            console.log('Billing started for patient:', patientId, 'in department:', departmentName);
        } catch (error) {
            console.error('Error starting patient billing:', error);
            this.showNotification('Error starting patient billing', 'error');
        }
    }

    async stopPatientBilling(patientId, dischargeTime, paymentStatus = null, paymentNotes = null) {
        try {
            const activeBill = this.patientBills.find(bill => 
                bill.patientId === patientId && bill.status === 'active'
            );

            if (!activeBill) {
                this.showNotification('No active billing found for this patient', 'error');
                return;
            }

            const billingRate = Object.values(this.billingRates).find(rate => 
                rate.departmentId === activeBill.departmentId && rate.isActive
            );

            if (!billingRate) {
                this.showNotification('No billing rate found for this department', 'error');
                return;
            }

            // Calculate total hours and cost with precise minutes
            const startTime = activeBill.billingStartTime.toDate();
            const endTime = dischargeTime || new Date();
            const totalMinutes = (endTime - startTime) / (1000 * 60); // Convert to minutes
            const totalHours = totalMinutes / 60; // Convert to fractional hours
            const totalCost = totalHours * billingRate.hourlyRate;

            const updateData = {
                status: 'completed',
                billingEndTime: firebase.firestore.FieldValue.serverTimestamp(),
                totalMinutes: Math.round(totalMinutes), // Store total minutes
                totalHours: Math.round(totalHours * 100) / 100, // Round to 2 decimal places
                totalCost: Math.round(totalCost * 100) / 100, // Round to 2 decimal places
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: this.currentUser.uid
            };

            // Add payment information if provided
            if (paymentStatus) {
                updateData.paymentStatus = paymentStatus;
                updateData.paymentUpdatedAt = firebase.firestore.FieldValue.serverTimestamp();
                updateData.paymentUpdatedBy = this.currentUser.uid;
            }
            if (paymentNotes) {
                updateData.paymentNotes = paymentNotes;
            }

            await window.collections.patientBills.doc(activeBill.id).update(updateData);

            await this.loadPatientBills();
            this.showNotification('Patient billing completed successfully', 'success');
        } catch (error) {
            console.error('Error stopping patient billing:', error);
        }
    }

    async addMedicationCost(patientId, medicationId, medicationName, quantity, unitCost) {
        try {
            const activeBill = this.patientBills.find(bill => 
                bill.patientId === patientId && bill.status === 'active'
            );

            if (!activeBill) {
                this.showNotification('No active billing found for this patient', 'error');
                return;
            }

            const medicationCost = {
                medicationId: medicationId,
                medicationName: medicationName,
                quantity: quantity,
                unitCost: unitCost,
                totalCost: quantity * unitCost,
                addedAt: firebase.firestore.FieldValue.serverTimestamp(),
                addedBy: this.currentUser.uid
            };

            await window.collections.patientBills.doc(activeBill.id).update({
                medicationCosts: firebase.firestore.FieldValue.arrayUnion(medicationCost),
                totalMedicationCost: firebase.firestore.FieldValue.increment(medicationCost.totalCost),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await this.loadPatientBills();
            this.showNotification('Medication cost added successfully', 'success');
        } catch (error) {
            console.error('Error adding medication cost:', error);
            this.showNotification('Error adding medication cost', 'error');
        }
    }

    async loadBillingRatesForSettings() {
        try {
            const snapshot = await window.collections.billingRates.get();
            const ratesList = document.getElementById('billingRatesList');
            if (!ratesList) return;

            ratesList.innerHTML = '';
            
            if (snapshot.empty) {
                ratesList.innerHTML = '<p class="text-gray-500 text-center py-4">No billing rates configured</p>';
                return;
            }

            snapshot.forEach(doc => {
                const rate = { id: doc.id, ...doc.data() };
                const rateElement = document.createElement('div');
                rateElement.className = 'bg-gray-50 p-4 rounded-lg';
                rateElement.innerHTML = `
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="font-semibold text-gray-800">${rate.departmentName}</h4>
                            <p class="text-sm text-gray-600">Hourly Rate: ₹${rate.hourlyRate}</p>
                        </div>
                        <div class="flex items-center space-x-2">
                            <input type="number" id="rate_${rate.id}" value="${rate.hourlyRate}" 
                                step="0.01" min="0" class="w-24 px-2 py-1 border border-gray-300 rounded text-sm">
                            <button onclick="updateBillingRate('${rate.id}')" 
                                class="text-blue-600 hover:text-blue-800 text-sm">Update</button>
                        </div>
                    </div>
                `;
                ratesList.appendChild(rateElement);
            });
        } catch (error) {
            console.error('Error loading billing rates:', error);
        }
    }

    async loadPatientBillsForSettings() {
        try {
            const snapshot = await window.collections.patientBills.get();
            const billsTable = document.getElementById('patientBillsTable');
            const activeBillsCount = document.getElementById('activeBillsCount');
            const totalRevenue = document.getElementById('totalRevenue');
            const pendingBillsCount = document.getElementById('pendingBillsCount');

            if (!billsTable) return;

            let activeCount = 0;
            let totalRevenueValue = 0;
            let pendingCount = 0;

            billsTable.innerHTML = '';

            if (snapshot.empty) {
                billsTable.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">No billing records found</td></tr>';
                return;
            }

            snapshot.forEach(doc => {
                const bill = { id: doc.id, ...doc.data() };
                
                if (bill.status === 'active') activeCount++;
                if (bill.status === 'completed') totalRevenueValue += bill.totalCost || 0;
                if (bill.status === 'pending') pendingCount++;

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="px-4 py-3">${bill.patientId}</td>
                    <td class="px-4 py-3">${bill.departmentName || 'N/A'}</td>
                    <td class="px-4 py-3">${bill.totalHours || 0} hours</td>
                    <td class="px-4 py-3">₹${bill.totalCost || 0}</td>
                    <td class="px-4 py-3">
                        <span class="px-2 py-1 rounded text-xs ${bill.status === 'active' ? 'bg-green-100 text-green-800' : bill.status === 'completed' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}">
                            ${bill.status}
                        </span>
                    </td>
                    <td class="px-4 py-3">
                        <button onclick="viewBillDetails('${bill.id}')" class="text-blue-600 hover:text-blue-800 text-sm">
                            View Details
                        </button>
                    </td>
                `;
                billsTable.appendChild(row);
            });

            if (activeBillsCount) activeBillsCount.textContent = activeCount;
            if (totalRevenue) totalRevenue.textContent = `₹${totalRevenueValue.toFixed(2)}`;
            if (pendingBillsCount) pendingBillsCount.textContent = pendingCount;

        } catch (error) {
            console.error('Error loading patient bills:', error);
        }
    }

    async generatePatientBill(patientId) {
        try {
            const patientBill = this.patientBills.find(bill => bill.patientId === patientId);
            if (!patientBill) {
                this.showNotification('No billing record found for this patient', 'error');
                return;
            }

            // Get patient information
            const patientDoc = await window.collections.patients.doc(patientId).get();
            const patient = patientDoc.data();

            // Get department information
            const departmentDoc = await window.collections.departments.doc(patientBill.departmentId).get();
            const department = departmentDoc.data();

            // Get billing rate
            const billingRate = Object.values(this.billingRates).find(rate => 
                rate.departmentId === patientBill.departmentId
            );

            const billData = {
                patient: patient,
                department: department,
                billing: patientBill,
                billingRate: billingRate,
                generatedAt: new Date()
            };

            return billData;
        } catch (error) {
            console.error('Error generating patient bill:', error);
            this.showNotification('Error generating patient bill', 'error');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
            type === 'success' ? 'bg-green-500 text-white' :
            type === 'error' ? 'bg-red-500 text-white' :
            'bg-blue-500 text-white'
        }`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Remove notification after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    async logActivity(action, description) {
        try {
            await window.collections.activities.add({
                action: action,
                description: description,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userId: this.currentUser.uid,
                userEmail: this.currentUser.email
            });
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    }
}

// Initialize billing manager
let billingManager;

document.addEventListener('DOMContentLoaded', () => {
    // Wait for Firebase to be ready
    const initBillingManager = () => {
        if (window.collections && window.collections.billingRates && window.auth) {
            billingManager = new BillingManager();
            window.billingManager = billingManager; // Make globally accessible
            billingManager.initialize().then(() => {
                console.log('Billing manager initialized successfully');
            });
        } else {
            console.log('Waiting for Firebase collections to be ready...');
            setTimeout(initBillingManager, 100);
        }
    };
    
    initBillingManager();
});

// Global functions for billing management
async function createBillingRate() {
    const departmentId = document.getElementById('departmentId')?.value || '';
    const departmentName = document.getElementById('departmentName')?.value || '';
    const hourlyRate = document.getElementById('hourlyRate')?.value || '';

    if (!departmentId || !departmentName || !hourlyRate) {
        const manager = window.billingManager || billingManager;
        if (manager) {
            manager.showNotification('Please fill in all required fields', 'error');
        }
        return;
    }

    if (isNaN(hourlyRate) || parseFloat(hourlyRate) <= 0) {
        const manager = window.billingManager || billingManager;
        if (manager) {
            manager.showNotification('Please enter a valid hourly rate', 'error');
        }
        return;
    }

    const manager = window.billingManager || billingManager;
    if (manager) {
        await manager.createBillingRate(departmentId, departmentName, hourlyRate);
        document.getElementById('billingRateForm')?.reset();
        closeBillingRateModal();
        
        // Reload the billing rates list if we're on the settings page
        if (typeof showSettingsSection !== 'undefined') {
            manager.loadBillingRatesForSettings();
        }
    } else {
        console.error('Billing manager not available');
    }
}

async function updateBillingRate(rateId) {
    const hourlyRate = document.getElementById(`rate_${rateId}`).value;
    
    if (!hourlyRate || isNaN(hourlyRate)) {
        billingManager.showNotification('Please enter a valid hourly rate', 'error');
        return;
    }

    await billingManager.updateBillingRate(rateId, hourlyRate);
}

async function viewBillDetails(billId) {
    try {
        const manager = window.billingManager || billingManager;
        if (!manager) {
            console.error('Billing manager not available');
            return;
        }

        // Get bill details
        const billDoc = await window.collections.patientBills.doc(billId).get();
        if (!billDoc.exists) {
            manager.showNotification('Bill not found', 'error');
            return;
        }

        const bill = { id: billDoc.id, ...billDoc.data() };

        // Get patient details
        let patient = null;
        if (bill.patientId) {
            const patientDoc = await window.collections.patients.doc(bill.patientId).get();
            if (patientDoc.exists) {
                patient = { id: patientDoc.id, ...patientDoc.data() };
            }
        }

        // Get billing rate details
        let billingRate = null;
        if (bill.departmentId) {
            const ratesSnapshot = await window.collections.billingRates
                .where('departmentId', '==', bill.departmentId)
                .where('isActive', '==', true)
                .get();
            if (!ratesSnapshot.empty) {
                billingRate = ratesSnapshot.docs[0].data();
            }
        }

        // Create and show modal
        showBillDetailsModal(bill, patient, billingRate);

    } catch (error) {
        console.error('Error viewing bill details:', error);
        const manager = window.billingManager || billingManager;
        if (manager) {
            manager.showNotification('Error loading bill details', 'error');
        }
    }
}

function showBillDetailsModal(bill, patient, billingRate) {
    // Remove existing modal if any
    const existingModal = document.getElementById('billDetailsModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Calculate duration display
    let durationDisplay = 'N/A';
    let preciseHours = 'N/A';
    if (bill.billingStartTime) {
        const startTime = bill.billingStartTime.toDate();
        const endTime = bill.billingEndTime ? bill.billingEndTime.toDate() : new Date();
        const totalMinutes = (endTime - startTime) / (1000 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = Math.floor(totalMinutes % 60);
        durationDisplay = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        preciseHours = (totalMinutes / 60).toFixed(3);
    }

    const modal = document.createElement('div');
    modal.id = 'billDetailsModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
                <h2 class="text-xl font-semibold text-gray-800">Bill Details</h2>
                <button onclick="closeBillDetailsModal()" class="text-gray-400 hover:text-gray-600">
                    <i class="ri-close-line text-2xl"></i>
                </button>
            </div>
            
            <div class="p-6 space-y-6">
                <!-- Bill Overview -->
                <div class="bg-gray-50 rounded-lg p-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <p class="text-sm text-gray-600">Bill ID</p>
                            <p class="font-semibold">#${bill.id.substring(0, 8)}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-600">Status</p>
                            <span class="px-3 py-1 rounded-full text-sm font-medium ${
                                bill.status === 'active' ? 'bg-green-100 text-green-800' :
                                bill.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                                'bg-yellow-100 text-yellow-800'
                            }">
                                ${bill.status?.toUpperCase()}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Patient Information -->
                ${patient ? `
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800 mb-3">Patient Information</h3>
                        <div class="bg-blue-50 rounded-lg p-4">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <p class="text-sm text-blue-600">Name</p>
                                    <p class="font-semibold text-blue-800">${patient.firstName} ${patient.lastName}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-blue-600">Patient ID</p>
                                    <p class="font-semibold text-blue-800">${patient.patientId || patient.id.substring(0, 8)}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-blue-600">Contact</p>
                                    <p class="font-semibold text-blue-800">${patient.contactNumber || 'N/A'}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-blue-600">Department</p>
                                    <p class="font-semibold text-blue-800">${bill.departmentName || 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ` : `
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800 mb-3">Patient Information</h3>
                        <div class="bg-red-50 rounded-lg p-4">
                            <p class="text-red-700">Patient information not available</p>
                            <p class="text-sm text-red-600">Patient ID: ${bill.patientId || 'Unknown'}</p>
                        </div>
                    </div>
                `}

                <!-- Billing Details -->
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 mb-3">Billing Details</h3>
                    <div class="bg-green-50 rounded-lg p-4">
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div>
                                <p class="text-sm text-green-600">Start Time</p>
                                <p class="font-semibold text-green-800">
                                    ${bill.billingStartTime ? 
                                        new Date(bill.billingStartTime.toDate()).toLocaleString() : 
                                        'N/A'
                                    }
                                </p>
                            </div>
                            <div>
                                <p class="text-sm text-green-600">End Time</p>
                                <p class="font-semibold text-green-800">
                                    ${bill.billingEndTime ? 
                                        new Date(bill.billingEndTime.toDate()).toLocaleString() : 
                                        bill.status === 'active' ? 'Ongoing' : 'N/A'
                                    }
                                </p>
                            </div>
                            <div>
                                <p class="text-sm text-green-600">Duration</p>
                                <p class="font-semibold text-green-800">${durationDisplay}</p>
                                <p class="text-xs text-green-600">${preciseHours} hours</p>
                            </div>
                            ${bill.totalMinutes ? `
                                <div>
                                    <p class="text-sm text-green-600">Total Minutes</p>
                                    <p class="font-semibold text-green-800">${bill.totalMinutes} min</p>
                                </div>
                            ` : ''}
                            <div>
                                <p class="text-sm text-green-600">Total Hours</p>
                                <p class="font-semibold text-green-800">${bill.totalHours || 0} hours</p>
                            </div>
                            <div>
                                <p class="text-sm text-green-600">Total Cost</p>
                                <p class="font-semibold text-green-800 text-lg">₹${bill.totalCost || 0}</p>
                            </div>
                            ${bill.paymentStatus ? `
                                <div>
                                    <p class="text-sm text-green-600">Payment Status</p>
                                    <span class="px-3 py-1 rounded-full text-sm font-medium ${
                                        bill.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
                                        bill.paymentStatus === 'pending' ? 'bg-orange-100 text-orange-800' :
                                        bill.paymentStatus === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-blue-100 text-blue-800'
                                    }">
                                        ${bill.paymentStatus?.toUpperCase()}
                                    </span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- Rate Information -->
                ${billingRate ? `
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800 mb-3">Rate Information</h3>
                        <div class="bg-purple-50 rounded-lg p-4">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <p class="text-sm text-purple-600">Hourly Rate</p>
                                    <p class="font-semibold text-purple-800">₹${billingRate.hourlyRate}/hour</p>
                                </div>
                                <div>
                                    <p class="text-sm text-purple-600">Calculation</p>
                                    <p class="font-semibold text-purple-800">
                                        ₹${billingRate.hourlyRate} × ${preciseHours}h = ₹${bill.totalCost || 0}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                ` : `
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800 mb-3">Rate Information</h3>
                        <div class="bg-yellow-50 rounded-lg p-4">
                            <p class="text-yellow-700">No billing rate configured for this department</p>
                        </div>
                    </div>
                `}

                <!-- Medication Costs (if any) -->
                ${bill.medicationCosts && bill.medicationCosts.length > 0 ? `
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800 mb-3">Medication Costs</h3>
                        <div class="space-y-2">
                            ${bill.medicationCosts.map(med => `
                                <div class="bg-orange-50 rounded-lg p-3">
                                    <div class="flex justify-between items-center">
                                        <div>
                                            <p class="font-medium text-orange-800">${med.medicationName}</p>
                                            <p class="text-sm text-orange-600">Qty: ${med.quantity} × ₹${med.unitCost}</p>
                                        </div>
                                        <p class="font-semibold text-orange-800">₹${med.totalCost}</p>
                                    </div>
                                </div>
                            `).join('')}
                            <div class="bg-orange-100 rounded-lg p-3 border border-orange-200">
                                <div class="flex justify-between items-center">
                                    <p class="font-semibold text-orange-800">Total Medication Cost</p>
                                    <p class="font-bold text-orange-800">₹${bill.totalMedicationCost || 0}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <!-- Payment Information -->
                ${bill.paymentStatus || bill.paymentNotes ? `
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800 mb-3">Payment Information</h3>
                        <div class="bg-gray-50 rounded-lg p-4">
                            ${bill.paymentStatus ? `
                                <div class="mb-3">
                                    <p class="text-sm text-gray-600 mb-1">Payment Status</p>
                                    <span class="px-3 py-1 rounded-full text-sm font-medium ${
                                        bill.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
                                        bill.paymentStatus === 'pending' ? 'bg-orange-100 text-orange-800' :
                                        bill.paymentStatus === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-blue-100 text-blue-800'
                                    }">
                                        <i class="${
                                            bill.paymentStatus === 'paid' ? 'ri-check-line' :
                                            bill.paymentStatus === 'pending' ? 'ri-time-line' :
                                            bill.paymentStatus === 'partial' ? 'ri-money-dollar-circle-line' :
                                            'ri-shield-check-line'
                                        } mr-1"></i>
                                        ${bill.paymentStatus?.toUpperCase()}
                                    </span>
                                </div>
                            ` : ''}
                            ${bill.paymentNotes ? `
                                <div>
                                    <p class="text-sm text-gray-600 mb-1">Payment Notes</p>
                                    <p class="text-sm text-gray-800 bg-white p-3 rounded border">${bill.paymentNotes}</p>
                                </div>
                            ` : ''}
                            ${bill.paymentUpdatedAt ? `
                                <div class="mt-3 pt-3 border-t">
                                    <p class="text-xs text-gray-500">
                                        Payment info updated: ${new Date(bill.paymentUpdatedAt.toDate()).toLocaleString()}
                                    </p>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>

            <!-- Footer -->
            <div class="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end space-x-3">
                <button onclick="printBillDetails('${bill.id}')" 
                    class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                    <i class="ri-printer-line mr-2"></i>Print
                </button>
                <button onclick="closeBillDetailsModal()" 
                    class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                    Close
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeBillDetailsModal();
        }
    });
}

function closeBillDetailsModal() {
    const modal = document.getElementById('billDetailsModal');
    if (modal) {
        modal.remove();
    }
}

function printBillDetails(billId) {
    // Create print-friendly version
    const modal = document.getElementById('billDetailsModal');
    if (!modal) return;
    
    const printContent = modal.querySelector('.bg-white').cloneNode(true);
    
    // Remove buttons and sticky elements for print
    printContent.querySelectorAll('button').forEach(btn => btn.remove());
    printContent.querySelectorAll('.sticky').forEach(el => el.classList.remove('sticky'));
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Bill Details - #${billId.substring(0, 8)}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @media print {
                    body { margin: 0; }
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body class="p-4">
            ${printContent.outerHTML}
        </body>
        </html>
    `);
    printWindow.document.close();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}

function closeBillingRateModal() {
    document.getElementById('billingRateModal').classList.add('hidden');
}

function showBillingRateModal() {
    document.getElementById('billingRateModal').classList.remove('hidden');
    // Populate departments each time modal opens to stay fresh
    if (window.billingManager) {
        window.billingManager.loadDepartmentsIntoSelect();
    } else if (billingManager) {
        billingManager.loadDepartmentsIntoSelect();
    } else {
        // If billing manager not ready, wait a bit and try again
        setTimeout(() => {
            if (window.billingManager) {
                window.billingManager.loadDepartmentsIntoSelect();
            } else if (billingManager) {
                billingManager.loadDepartmentsIntoSelect();
            }
        }, 100);
    }
}
