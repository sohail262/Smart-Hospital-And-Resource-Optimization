class ResourceManager {
    constructor() {
        this.resources = [];
        this.departmentResources = new Map();
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.filters = {
            category: '',
            search: '',
            department: ''
        };
        this.listeners = [];
        this.aiOptimizationEnabled = true;
        this.geminiApiKey = null; // Will be loaded from settings
        this.init();
    }

    async init() {
        await this.checkAuth();
        await this.loadGeminiApiKey();
        await this.loadDepartments();
        this.setupEventListeners();
        this.setupRealTimeListeners();
        this.loadDepartmentResources();
        this.updateResourceTransferStatus();
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
        // Search
        document.getElementById('resourceSearch').addEventListener('input', (e) => {
            this.filters.search = e.target.value.toLowerCase();
            this.applyFilters();
        });

        // Department resource form
        document.getElementById('deptResourceForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveDepartmentResources();
        });

        // Transfer form
        document.getElementById('transferForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.transferResources();
        });

        // From department change for transfer
        document.getElementById('fromDepartment').addEventListener('change', (e) => {
            this.loadAvailableResources(e.target.value);
        });

        // Category filter from URL
        const urlParams = new URLSearchParams(window.location.search);
        const department = urlParams.get('department');
        const patientId = urlParams.get('patient');
        
        if (department) {
            this.filters.department = department;
        }
        
        if (patientId) {
            this.handlePatientResourceContext(patientId);
        }
    }

    setupRealTimeListeners() {
        // Resources listener
        this.listeners.push(
            window.collections.resources.onSnapshot(snapshot => {
                this.resources = [];
                snapshot.forEach(doc => {
                    this.resources.push({ id: doc.id, ...doc.data() });
                });
                this.updateResourceCounts();
                this.renderResourceTable();
            })
        );

        // Beds specific listener
        this.listeners.push(
            window.collections.beds.onSnapshot(snapshot => {
                let total = 0, available = 0, occupied = 0;
                snapshot.forEach(doc => {
                    const bed = doc.data();
                    total++;
                    if (bed.status === 'available') available++;
                    else if (bed.status === 'occupied') occupied++;
                });
                document.getElementById('totalBeds').textContent = total;
                document.getElementById('availableBeds').textContent = available;
                document.getElementById('occupiedBeds').textContent = occupied;
                
                // Update bed availability by department
                this.updateBedAvailabilityByDepartment(snapshot);
            })
        );

        // Equipment counts
        this.listeners.push(
            window.collections.equipment.onSnapshot(snapshot => {
                const counts = { ventilators: 0, monitors: 0, ivPumps: 0 };
                snapshot.forEach(doc => {
                    const equipment = doc.data();
                    switch(equipment.type) {
                        case 'ventilator': counts.ventilators++; break;
                        case 'monitor': counts.monitors++; break;
                        case 'iv_pump': counts.ivPumps++; break;
                    }
                });
                document.getElementById('ventilators').textContent = counts.ventilators;
                document.getElementById('monitors').textContent = counts.monitors;
                document.getElementById('ivPumps').textContent = counts.ivPumps;
            })
        );

        // Medication stock levels
        this.listeners.push(
            window.collections.medications.onSnapshot(snapshot => {
                let critical = 0, low = 0, adequate = 0;
                snapshot.forEach(doc => {
                    const med = doc.data();
                    const stockLevel = (med.currentStock / med.minStock) * 100;
                    if (stockLevel <= 25) critical++;
                    else if (stockLevel <= 50) low++;
                    else adequate++;
                });
                document.getElementById('criticalMeds').textContent = critical;
                document.getElementById('lowMeds').textContent = low;
                document.getElementById('adequateMeds').textContent = adequate;
            })
        );
    }

    async loadDepartments() {
        const selects = [
            document.getElementById('resourceDepartment'),
            document.getElementById('deptResourceDepartment'),
            document.getElementById('fromDepartment'),
            document.getElementById('toDepartment')
        ];
        
        const snapshot = await window.collections.departments.get();
        
        selects.forEach(select => {
            if (select) {
                select.innerHTML = '<option value="">Select Department</option>';
                snapshot.forEach(doc => {
                    const dept = doc.data();
                    select.innerHTML += `<option value="${doc.id}">${dept.name}</option>`;
                });
            }
        });
    }

    updateResourceCounts() {
        // Update supply counts
        const supplies = this.resources.filter(r => r.category === 'supply');
        const ppeCounts = supplies.filter(s => s.name?.toLowerCase().includes('ppe')).length;
        const syringeCounts = supplies.filter(s => s.name?.toLowerCase().includes('syringe')).length;
        const bandageCounts = supplies.filter(s => s.name?.toLowerCase().includes('bandage')).length;
        
        document.getElementById('ppeKits').textContent = ppeCounts;
        document.getElementById('syringes').textContent = syringeCounts;
        document.getElementById('bandages').textContent = bandageCounts;
    }

    renderResourceTable() {
        const filteredResources = this.getFilteredResources();
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedResources = filteredResources.slice(startIndex, endIndex);
        
        const tbody = document.getElementById('resourceTableBody');
        tbody.innerHTML = '';
        
        if (paginatedResources.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-8 text-center text-gray-500">
                        No resources found
                    </td>
                            </tr>
            `;
            return;
        }
        
        paginatedResources.forEach(resource => {
            const statusColor = this.getStatusColor(resource.status);
            const lastUpdated = resource.updatedAt ? new Date(resource.updatedAt.toDate()).toLocaleString() : 'N/A';
            
            tbody.innerHTML += `
                <tr class="hover:bg-gray-50 transition">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #${resource.id.substring(0, 8)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${resource.name || 'N/A'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            ${this.formatCategory(resource.category)}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${resource.departmentName || 'General'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${statusColor}-100 text-${statusColor}-800">
                            ${resource.status || 'Unknown'}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${lastUpdated}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onclick="editResource('${resource.id}')" 
                            class="text-indigo-600 hover:text-indigo-900 mr-3">
                            <i class="ri-edit-line"></i>
                        </button>
                        <button onclick="deleteResource('${resource.id}')" 
                            class="text-red-600 hover:text-red-900">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        // Update pagination info
        document.getElementById('showingStart').textContent = startIndex + 1;
        document.getElementById('showingEnd').textContent = Math.min(endIndex, filteredResources.length);
        document.getElementById('totalResources').textContent = filteredResources.length;
        
        // Update pagination buttons
        document.getElementById('prevBtn').disabled = this.currentPage === 1;
        document.getElementById('nextBtn').disabled = endIndex >= filteredResources.length;
    }

    getFilteredResources() {
        return this.resources.filter(resource => {
            // Category filter
            if (this.filters.category && resource.category !== this.filters.category) {
                return false;
            }
            
            // Department filter
            if (this.filters.department && resource.departmentId !== this.filters.department) {
                return false;
            }
            
            // Search filter
            if (this.filters.search) {
                const searchStr = this.filters.search.toLowerCase();
                return resource.name?.toLowerCase().includes(searchStr) ||
                       resource.id.toLowerCase().includes(searchStr) ||
                       resource.model?.toLowerCase().includes(searchStr);
            }
            
            return true;
        });
    }

    getStatusColor(status) {
        const statusColors = {
            'available': 'green',
            'in-use': 'blue',
            'occupied': 'blue',
            'maintenance': 'yellow',
            'out-of-order': 'red',
            'critical': 'red',
            'low': 'yellow',
            'adequate': 'green'
        };
        return statusColors[status?.toLowerCase()] || 'gray';
    }

    formatCategory(category) {
        const categoryMap = {
            'bed': 'Bed',
            'equipment': 'Equipment',
            'medication': 'Medication',
            'supply': 'Supply'
        };
        return categoryMap[category] || category;
    }

    getDepartmentCode(departmentName) {
        const departmentCodes = {
            'Emergency': 'EMR',
            'ICU': 'ICU',
            'General Ward': 'GWD',
            'Pediatrics': 'PED',
            'Surgery': 'SUR',
            'Maternity': 'MAT',
            'Paediatric Medicine and Neonatology': 'PMN',
            'Dermatology': 'DRM',
            'Psychiatry': 'PSY',
            'Tuberculosis & Chest': 'TBC',
            'General Surgery': 'GSR',
            'Orthopaedics': 'ORT',
            'Otorhinolaryngology (ENT)': 'ENT',
            'Obstetrics & Gynaecology': 'OBG',
            'Ophthalmology': 'OPH',
            'Anaesthesiology': 'ANS'
        };
        return departmentCodes[departmentName] || departmentName.substring(0, 3).toUpperCase();
    }

    async updateBedAvailabilityByDepartment(snapshot) {
        try {
            const departmentStats = {};
            
            // Process bed data by department
            snapshot.forEach(doc => {
                const bed = doc.data();
                const deptId = bed.departmentId;
                const deptName = bed.departmentName;
                
                if (!departmentStats[deptId]) {
                    departmentStats[deptId] = {
                        name: deptName,
                        total: 0,
                        available: 0,
                        occupied: 0
                    };
                }
                
                departmentStats[deptId].total++;
                if (bed.status === 'available') {
                    departmentStats[deptId].available++;
                } else if (bed.status === 'occupied') {
                    departmentStats[deptId].occupied++;
                }
            });
            
            // Render the department availability
            const container = document.getElementById('bedAvailabilityByDept');
            if (container) {
                container.innerHTML = Object.values(departmentStats).map(dept => {
                    const utilization = dept.total > 0 ? Math.round((dept.occupied / dept.total) * 100) : 0;
                    const statusColor = utilization >= 90 ? 'red' : utilization >= 75 ? 'yellow' : 'green';
                    
                    return `
                        <div class="border border-gray-200 rounded-lg p-4">
                            <div class="flex justify-between items-center mb-2">
                                <h4 class="font-medium text-gray-800">${dept.name}</h4>
                                <span class="text-sm text-gray-500">${utilization}% occupied</span>
                            </div>
                            <div class="space-y-2">
                                <div class="flex justify-between text-sm">
                                    <span class="text-gray-600">Available</span>
                                    <span class="font-medium text-green-600">${dept.available}</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-gray-600">Occupied</span>
                                    <span class="font-medium text-red-600">${dept.occupied}</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-gray-600">Total</span>
                                    <span class="font-medium">${dept.total}</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                                    <div class="bg-${statusColor}-500 h-2 rounded-full transition-all duration-300" 
                                         style="width: ${utilization}%"></div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch (error) {
            console.error('Error updating bed availability by department:', error);
        }
    }

    async addResource() {
        const form = document.getElementById('addResourceForm');
        const submitButton = form.querySelector('button[type="submit"]');
        
        try {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Adding...';
            
            const resourceData = {
                name: document.getElementById('resourceName').value,
                category: document.getElementById('resourceCategory').value,
                departmentId: document.getElementById('resourceDepartment').value,
                quantity: parseInt(document.getElementById('resourceQuantity').value),
                model: document.getElementById('resourceModel').value || '',
                location: document.getElementById('resourceLocation').value || '',
                notes: document.getElementById('resourceNotes').value || '',
                status: 'available',
                createdBy: this.currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Get department name
            const deptDoc = await window.collections.departments.doc(resourceData.departmentId).get();
            if (deptDoc.exists) {
                resourceData.departmentName = deptDoc.data().name;
            }
            
            // Add to appropriate collection based on category
            let collection = 'resources';
            switch(resourceData.category) {
                case 'bed':
                    collection = 'beds';
                    // Bulk create beds using batched writes with proper numbering
                    let batch = db.batch();
                    let batchCount = 0;
                    
                    // Get department code for bed numbering
                    const deptCode = this.getDepartmentCode(resourceData.departmentName);
                    
                    // Get existing bed count to continue numbering
                    const existingBeds = await window.collections.beds
                        .where('departmentId', '==', resourceData.departmentId)
                        .orderBy('bedIndex', 'desc')
                        .limit(1)
                        .get();
                    
                    let startIndex = 1;
                    if (!existingBeds.empty) {
                        startIndex = (existingBeds.docs[0].data().bedIndex || 0) + 1;
                    }
                    
                    for (let i = 0; i < resourceData.quantity; i++) {
                        const ref = window.collections.beds.doc();
                        const bedIndex = startIndex + i;
                        batch.set(ref, {
                            ...resourceData,
                            bedNumber: `${deptCode}${bedIndex.toString().padStart(3, '0')}`,
                            patientId: null,
                            status: 'available',
                            bedIndex: bedIndex,
                            ward: resourceData.departmentName,
                            floor: Math.floor((bedIndex - 1) / 20) + 1
                        });
                        batchCount++;
                        if (batchCount === 400) { // Firestore batch limit safety
                            await batch.commit();
                            batch = db.batch();
                            batchCount = 0;
                        }
                    }
                    if (batchCount > 0) await batch.commit();
                    break;
                case 'equipment':
                    collection = 'equipment';
                    break;
                case 'medication':
                    collection = 'medications';
                    resourceData.currentStock = resourceData.quantity;
                    resourceData.minStock = Math.floor(resourceData.quantity * 0.2); // 20% as minimum
                    break;
                case 'supply':
                    collection = 'supplies';
                    break;
            }
            
            await collections[collection].add(resourceData);
            
            // Also add to general resources collection
            await window.collections.resources.add(resourceData);
            
            // Log activity
            await this.logActivity('resource_added', `Added ${resourceData.quantity} ${resourceData.name}`);
            
            // Show success message
            this.showNotification('Resource added successfully!', 'success');
            
            // Reset form and close modal
            form.reset();
            closeAddResourceModal();
            
        } catch (error) {
            console.error('Error adding resource:', error);
            this.showNotification('Error adding resource. Please try again.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Add Resource';
        }
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

    // ===== NEW DEPARTMENT RESOURCE MANAGEMENT METHODS =====

    async loadGeminiApiKey() {
        try {
            const settingsDoc = await window.collections.settings.doc('gemini').get();
            if (settingsDoc.exists) {
                this.geminiApiKey = settingsDoc.data().apiKey;
            }
        } catch (error) {
            console.error('Error loading Gemini API key:', error);
        }
    }

    async loadDepartmentResources() {
        try {
            const snapshot = await window.collections.departmentResources.get();
            const container = document.getElementById('departmentResourceCards');
            
            if (!container) return;
            
            container.innerHTML = '';
            
            snapshot.forEach(doc => {
                const deptResource = doc.data();
                this.renderDepartmentResourceCard(doc.id, deptResource);
            });
        } catch (error) {
            console.error('Error loading department resources:', error);
        }
    }

    renderDepartmentResourceCard(id, deptResource) {
        const container = document.getElementById('departmentResourceCards');
        if (!container) return;

        const card = document.createElement('div');
        card.className = 'bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition';
        
        const equipmentCount = deptResource.equipment ? Object.keys(deptResource.equipment).length : 0;
        const suppliesCount = deptResource.supplies ? Object.keys(deptResource.supplies).length : 0;
        
        // Create equipment list
        const equipmentList = deptResource.equipment ? 
            Object.entries(deptResource.equipment).map(([key, item]) => 
                `<div class="flex justify-between items-center text-sm">
                    <span class="text-gray-600">${item.name}</span>
                    <span class="font-medium">${item.available}/${item.quantity}</span>
                </div>`
            ).join('') : '<div class="text-sm text-gray-500">No equipment</div>';
            
        // Create supplies list
        const suppliesList = deptResource.supplies ? 
            Object.entries(deptResource.supplies).map(([key, item]) => 
                `<div class="flex justify-between items-center text-sm">
                    <span class="text-gray-600">${item.name}</span>
                    <span class="font-medium">${item.available}/${item.quantity}</span>
                </div>`
            ).join('') : '<div class="text-sm text-gray-500">No supplies</div>';
        
        card.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <h4 class="font-semibold text-gray-800">${deptResource.departmentName}</h4>
                <div class="flex space-x-2">
                    <button onclick="editDepartmentResources('${id}')" 
                        class="text-blue-600 hover:text-blue-800 p-1" title="Edit Resources">
                        <i class="ri-edit-line"></i>
                    </button>
                    <button onclick="deleteDepartmentResources('${id}')" 
                        class="text-red-600 hover:text-red-800 p-1" title="Delete Department Resources">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>
            
            <div class="space-y-4">
                <!-- Equipment Section -->
                <div>
                    <div class="flex items-center space-x-2 mb-2">
                        <i class="ri-stethoscope-line text-green-600"></i>
                        <span class="font-medium text-gray-800">Equipment (${equipmentCount} items)</span>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
                        ${equipmentList}
                    </div>
                </div>
                
                <!-- Supplies Section -->
                <div>
                    <div class="flex items-center space-x-2 mb-2">
                        <i class="ri-box-3-line text-orange-600"></i>
                        <span class="font-medium text-gray-800">Supplies (${suppliesCount} items)</span>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
                        ${suppliesList}
                    </div>
                </div>
            </div>
            
            <div class="mt-4 pt-4 border-t text-xs text-gray-500">
                Last updated: ${deptResource.updatedAt ? new Date(deptResource.updatedAt.toDate()).toLocaleString() : 'Never'}
            </div>
        `;
        
        container.appendChild(card);
    }

    async saveDepartmentResources() {
        const form = document.getElementById('deptResourceForm');
        const submitButton = form.querySelector('button[type="submit"]');
        
        try {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Saving...';
            
            const departmentId = document.getElementById('deptResourceDepartment').value;
            if (!departmentId) {
                throw new Error('Please select a department');
            }
            
            // Get department name
            const deptDoc = await window.collections.departments.doc(departmentId).get();
            const departmentName = deptDoc.exists ? deptDoc.data().name : 'Unknown';
            
            // Collect equipment data
            const equipment = {};
            const equipmentRows = document.querySelectorAll('#equipmentSection .grid');
            equipmentRows.forEach(row => {
                const inputs = row.querySelectorAll('input');
                if (inputs.length >= 2 && inputs[0].value && inputs[1].value) {
                    equipment[inputs[0].value] = {
                        name: inputs[0].value,
                        quantity: parseInt(inputs[1].value),
                        available: parseInt(inputs[1].value),
                        inUse: 0
                    };
                }
            });
            
            // Collect supplies data
            const supplies = {};
            const suppliesRows = document.querySelectorAll('#suppliesSection .grid');
            suppliesRows.forEach(row => {
                const inputs = row.querySelectorAll('input');
                if (inputs.length >= 2 && inputs[0].value && inputs[1].value) {
                    supplies[inputs[0].value] = {
                        name: inputs[0].value,
                        quantity: parseInt(inputs[1].value),
                        available: parseInt(inputs[1].value),
                        inUse: 0
                    };
                }
            });
            
            const resourceData = {
                departmentId,
                departmentName,
                equipment,
                supplies,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: this.currentUser.uid
            };
            
            // Save or update department resources
            const existingDoc = await window.collections.departmentResources
                .where('departmentId', '==', departmentId)
                .limit(1)
                .get();
                
            if (!existingDoc.empty) {
                await existingDoc.docs[0].ref.update(resourceData);
            } else {
                resourceData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await window.collections.departmentResources.add(resourceData);
            }
            
            this.showNotification('Department resources saved successfully!', 'success');
            closeDeptResourceModal();
            this.loadDepartmentResources();
            
        } catch (error) {
            console.error('Error saving department resources:', error);
            this.showNotification(error.message || 'Error saving department resources', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Save Resources';
        }
    }

    async loadAvailableResources(departmentId) {
        if (!departmentId) return;
        
        try {
            const resourceSelect = document.getElementById('transferResource');
            resourceSelect.innerHTML = '<option value="">Select Resource</option>';
            
            // Get department resources
            const snapshot = await window.collections.departmentResources
                .where('departmentId', '==', departmentId)
                .limit(1)
                .get();
                
            if (!snapshot.empty) {
                const deptResource = snapshot.docs[0].data();
                
                // Add equipment options
                if (deptResource.equipment) {
                    Object.entries(deptResource.equipment).forEach(([key, equipment]) => {
                        if (equipment.available > 0) {
                            resourceSelect.innerHTML += `<option value="equipment:${key}">Equipment: ${equipment.name} (Available: ${equipment.available})</option>`;
                        }
                    });
                }
                
                // Add supplies options
                if (deptResource.supplies) {
                    Object.entries(deptResource.supplies).forEach(([key, supply]) => {
                        if (supply.available > 0) {
                            resourceSelect.innerHTML += `<option value="supply:${key}">Supply: ${supply.name} (Available: ${supply.available})</option>`;
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error loading available resources:', error);
        }
    }

    async transferResources() {
        const form = document.getElementById('transferForm');
        const submitButton = form.querySelector('button[type="submit"]');
        
        try {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Transferring...';
            
            const fromDeptId = document.getElementById('fromDepartment').value;
            const toDeptId = document.getElementById('toDepartment').value;
            const resourceInfo = document.getElementById('transferResource').value;
            const quantity = parseInt(document.getElementById('transferQuantity').value);
            const reason = document.getElementById('transferReason').value;
            
            if (!fromDeptId || !toDeptId || !resourceInfo || !quantity || !reason) {
                throw new Error('Please fill in all fields');
            }
            
            if (fromDeptId === toDeptId) {
                throw new Error('Cannot transfer to the same department');
            }
            
            const [resourceType, resourceKey] = resourceInfo.split(':');
            
            // Update source department
            const fromSnapshot = await window.collections.departmentResources
                .where('departmentId', '==', fromDeptId)
                .limit(1)
                .get();
                
            if (fromSnapshot.empty) {
                throw new Error('Source department resources not found');
            }
            
            const fromDoc = fromSnapshot.docs[0];
            const fromData = fromDoc.data();
            
            if (!fromData[resourceType] || !fromData[resourceType][resourceKey]) {
                throw new Error('Resource not found in source department');
            }
            
            if (fromData[resourceType][resourceKey].available < quantity) {
                throw new Error('Insufficient quantity available for transfer');
            }
            
            // Update source department (reduce quantity)
            fromData[resourceType][resourceKey].available -= quantity;
            fromData[resourceType][resourceKey].quantity -= quantity;
            fromData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            
            await fromDoc.ref.update(fromData);
            
            // Update destination department
            const toSnapshot = await window.collections.departmentResources
                .where('departmentId', '==', toDeptId)
                .limit(1)
                .get();
                
            let toDoc, toData;
            
            if (toSnapshot.empty) {
                // Create new department resource document
                const toDeptDoc = await window.collections.departments.doc(toDeptId).get();
                toData = {
                    departmentId: toDeptId,
                    departmentName: toDeptDoc.data().name,
                    equipment: {},
                    supplies: {},
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                toDoc = await window.collections.departmentResources.add(toData);
            } else {
                toDoc = toSnapshot.docs[0];
                toData = toDoc.data();
            }
            
            // Add or update resource in destination department
            if (!toData[resourceType]) {
                toData[resourceType] = {};
            }
            
            if (toData[resourceType][resourceKey]) {
                toData[resourceType][resourceKey].available += quantity;
                toData[resourceType][resourceKey].quantity += quantity;
            } else {
                toData[resourceType][resourceKey] = {
                    name: fromData[resourceType][resourceKey].name,
                    quantity: quantity,
                    available: quantity,
                    inUse: 0
                };
            }
            
            toData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            
            if (toSnapshot.empty) {
                await toDoc.update(toData);
            } else {
                await toDoc.ref.update(toData);
            }
            
            // Log the transfer
            await window.collections.resourceTransfers.add({
                fromDepartmentId: fromDeptId,
                toDepartmentId: toDeptId,
                resourceType,
                resourceKey,
                resourceName: fromData[resourceType][resourceKey].name,
                quantity,
                reason,
                transferredBy: this.currentUser.uid,
                transferredAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            this.showNotification('Resources transferred successfully!', 'success');
            closeTransferModal();
            this.loadDepartmentResources();
            this.updateResourceTransferStatus();
            
        } catch (error) {
            console.error('Error transferring resources:', error);
            this.showNotification(error.message || 'Error transferring resources', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Transfer Resources';
        }
    }

    async updateResourceTransferStatus() {
        try {
            const container = document.getElementById('resourceTransferStatus');
            if (!container) return;
            
            // Get recent transfers
            const transfersSnapshot = await window.collections.resourceTransfers
                .orderBy('transferredAt', 'desc')
                .limit(10)
                .get();
                
            container.innerHTML = '';
            
            if (transfersSnapshot.empty) {
                container.innerHTML = '<div class="col-span-full text-center text-gray-500 py-8">No recent transfers</div>';
                return;
            }
            
            transfersSnapshot.forEach(doc => {
                const transfer = doc.data();
                const transferDate = transfer.transferredAt ? 
                    new Date(transfer.transferredAt.toDate()).toLocaleDateString() : 'Unknown';
                    
                const transferCard = document.createElement('div');
                transferCard.className = 'bg-gray-50 border border-gray-200 rounded-lg p-4';
                transferCard.innerHTML = `
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-medium text-gray-800">${transfer.resourceName}</span>
                        <span class="text-xs text-gray-500">${transferDate}</span>
                    </div>
                    <div class="text-xs text-gray-600">
                        <div>Qty: ${transfer.quantity}</div>
                        <div class="mt-1 truncate" title="${transfer.reason}">Reason: ${transfer.reason}</div>
                    </div>
                `;
                container.appendChild(transferCard);
            });
        } catch (error) {
            console.error('Error updating transfer status:', error);
        }
    }

    async generateAIRecommendations() {
        if (!this.geminiApiKey) {
            this.showNotification('Gemini API key not configured. Please check settings.', 'error');
            return;
        }
        
        const button = document.querySelector('button[onclick="generateAIRecommendations()"]');
        const originalText = button.innerHTML;
        
        try {
            button.disabled = true;
            button.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Generating...';
            
            // Collect real-time data
            const [departmentResourcesSnapshot, patientsSnapshot, bedsSnapshot] = await Promise.all([
                window.collections.departmentResources.get(),
                window.collections.patients.where('status', '==', 'active').get(),
                window.collections.beds.get()
            ]);
            
            // Prepare data for AI analysis
            const analysisData = {
                departments: [],
                patientLoad: {},
                bedOccupancy: {},
                resourceUtilization: {}
            };
            
            // Process department resources
            departmentResourcesSnapshot.forEach(doc => {
                const deptResource = doc.data();
                analysisData.departments.push({
                    name: deptResource.departmentName,
                    equipment: deptResource.equipment || {},
                    supplies: deptResource.supplies || {}
                });
            });
            
            // Process patient load
            patientsSnapshot.forEach(doc => {
                const patient = doc.data();
                const deptName = patient.departmentName || 'Unassigned';
                analysisData.patientLoad[deptName] = (analysisData.patientLoad[deptName] || 0) + 1;
            });
            
            // Process bed occupancy
            bedsSnapshot.forEach(doc => {
                const bed = doc.data();
                const deptName = bed.departmentName || 'Unknown';
                if (!analysisData.bedOccupancy[deptName]) {
                    analysisData.bedOccupancy[deptName] = { total: 0, occupied: 0 };
                }
                analysisData.bedOccupancy[deptName].total++;
                if (bed.status === 'occupied') {
                    analysisData.bedOccupancy[deptName].occupied++;
                }
            });
            
            // Call Gemini API
            const recommendations = await this.callGeminiAPI(analysisData);
            
            // Display recommendations
            this.displayAIRecommendations(recommendations);
            
        } catch (error) {
            console.error('Error generating AI recommendations:', error);
            this.showNotification('Error generating recommendations: ' + error.message, 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }

    // Method to edit department resources
    async editDepartmentResources(docId) {
        try {
            const doc = await window.collections.departmentResources.doc(docId).get();
            if (!doc.exists) {
                this.showNotification('Department resource not found', 'error');
                return;
            }
            
            const deptResource = doc.data();
            this.showEditDepartmentResourcesModal(docId, deptResource);
        } catch (error) {
            console.error('Error loading department resource for edit:', error);
            this.showNotification('Error loading resource data', 'error');
        }
    }
    
    showEditDepartmentResourcesModal(docId, deptResource) {
        const modal = document.createElement('div');
        modal.id = 'editDeptResourceModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
        
        // Build equipment list for editing
        const equipmentHTML = deptResource.equipment ? 
            Object.entries(deptResource.equipment).map(([key, item]) => `
                <div class="grid grid-cols-1 md:grid-cols-4 gap-3 p-2 border border-gray-200 rounded">
                    <input type="text" value="${item.name}" class="px-3 py-2 border border-gray-300 rounded-lg equipment-name" placeholder="Equipment name">
                    <input type="number" value="${item.quantity}" class="px-3 py-2 border border-gray-300 rounded-lg equipment-qty" placeholder="Total quantity" min="1">
                    <input type="number" value="${item.available}" class="px-3 py-2 border border-gray-300 rounded-lg equipment-avail" placeholder="Available quantity" min="0">
                    <button type="button" onclick="this.parentElement.remove()" class="bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>`).join('') : '';
        
        // Build supplies list for editing  
        const suppliesHTML = deptResource.supplies ?
            Object.entries(deptResource.supplies).map(([key, item]) => `
                <div class="grid grid-cols-1 md:grid-cols-4 gap-3 p-2 border border-gray-200 rounded">
                    <input type="text" value="${item.name}" class="px-3 py-2 border border-gray-300 rounded-lg supply-name" placeholder="Supply name">
                    <input type="number" value="${item.quantity}" class="px-3 py-2 border border-gray-300 rounded-lg supply-qty" placeholder="Total quantity" min="1">
                    <input type="number" value="${item.available}" class="px-3 py-2 border border-gray-300 rounded-lg supply-avail" placeholder="Available quantity" min="0">
                    <button type="button" onclick="this.parentElement.remove()" class="bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>`).join('') : '';
                
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div class="p-6 border-b">
                    <h3 class="text-xl font-semibold text-gray-800">Edit Department Resources - ${deptResource.departmentName}</h3>
                </div>
                
                <div class="p-6 space-y-6">
                    <!-- Equipment Section -->
                    <div class="border border-gray-200 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-4">
                            <h4 class="text-lg font-medium text-gray-800 flex items-center">
                                <i class="ri-stethoscope-line mr-2 text-green-600"></i>
                                Equipment
                            </h4>
                            <button type="button" onclick="this.addEquipmentRowEdit()" class="bg-green-100 text-green-700 px-3 py-2 rounded-lg hover:bg-green-200">
                                <i class="ri-add-line mr-1"></i> Add Equipment
                            </button>
                        </div>
                        <div id="editEquipmentSection" class="space-y-3">
                            ${equipmentHTML}
                        </div>
                    </div>
                    
                    <!-- Supplies Section -->
                    <div class="border border-gray-200 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-4">
                            <h4 class="text-lg font-medium text-gray-800 flex items-center">
                                <i class="ri-box-3-line mr-2 text-orange-600"></i>
                                Supplies
                            </h4>
                            <button type="button" onclick="this.addSupplyRowEdit()" class="bg-orange-100 text-orange-700 px-3 py-2 rounded-lg hover:bg-orange-200">
                                <i class="ri-add-line mr-1"></i> Add Supply
                            </button>
                        </div>
                        <div id="editSuppliesSection" class="space-y-3">
                            ${suppliesHTML}
                        </div>
                    </div>
                    
                    <div class="flex justify-end space-x-3 pt-4">
                        <button type="button" onclick="document.getElementById('editDeptResourceModal').remove()"
                            class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                            Cancel
                        </button>
                        <button type="button" onclick="window.resourceManager.saveEditedDepartmentResources('${docId}')"
                            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Add helper functions to modal
        modal.addEquipmentRowEdit = function() {
            const container = document.getElementById('editEquipmentSection');
            const newRow = document.createElement('div');
            newRow.className = 'grid grid-cols-1 md:grid-cols-4 gap-3 p-2 border border-gray-200 rounded';
            newRow.innerHTML = `
                <input type="text" class="px-3 py-2 border border-gray-300 rounded-lg equipment-name" placeholder="Equipment name">
                <input type="number" class="px-3 py-2 border border-gray-300 rounded-lg equipment-qty" placeholder="Total quantity" min="1">
                <input type="number" class="px-3 py-2 border border-gray-300 rounded-lg equipment-avail" placeholder="Available quantity" min="0">
                <button type="button" onclick="this.parentElement.remove()" class="bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200">
                    <i class="ri-delete-bin-line"></i>
                </button>
            `;
            container.appendChild(newRow);
        };
        
        modal.addSupplyRowEdit = function() {
            const container = document.getElementById('editSuppliesSection');
            const newRow = document.createElement('div');
            newRow.className = 'grid grid-cols-1 md:grid-cols-4 gap-3 p-2 border border-gray-200 rounded';
            newRow.innerHTML = `
                <input type="text" class="px-3 py-2 border border-gray-300 rounded-lg supply-name" placeholder="Supply name">
                <input type="number" class="px-3 py-2 border border-gray-300 rounded-lg supply-qty" placeholder="Total quantity" min="1">
                <input type="number" class="px-3 py-2 border border-gray-300 rounded-lg supply-avail" placeholder="Available quantity" min="0">
                <button type="button" onclick="this.parentElement.remove()" class="bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200">
                    <i class="ri-delete-bin-line"></i>
                </button>
            `;
            container.appendChild(newRow);
        };
        
        document.body.appendChild(modal);
    }
    
    async saveEditedDepartmentResources(docId) {
        try {
            const equipmentElements = document.querySelectorAll('#editEquipmentSection > div');
            const suppliesElements = document.querySelectorAll('#editSuppliesSection > div');
            
            const equipment = {};
            const supplies = {};
            
            // Process equipment
            equipmentElements.forEach((element, index) => {
                const name = element.querySelector('.equipment-name').value.trim();
                const quantity = parseInt(element.querySelector('.equipment-qty').value) || 0;
                const available = parseInt(element.querySelector('.equipment-avail').value) || 0;
                
                if (name && quantity > 0) {
                    equipment[`item_${index}`] = {
                        name: name,
                        quantity: quantity,
                        available: Math.min(available, quantity),
                        inUse: quantity - Math.min(available, quantity)
                    };
                }
            });
            
            // Process supplies
            suppliesElements.forEach((element, index) => {
                const name = element.querySelector('.supply-name').value.trim();
                const quantity = parseInt(element.querySelector('.supply-qty').value) || 0;
                const available = parseInt(element.querySelector('.supply-avail').value) || 0;
                
                if (name && quantity > 0) {
                    supplies[`item_${index}`] = {
                        name: name,
                        quantity: quantity,
                        available: Math.min(available, quantity),
                        inUse: quantity - Math.min(available, quantity)
                    };
                }
            });
            
            // Update document
            await window.collections.departmentResources.doc(docId).update({
                equipment: equipment,
                supplies: supplies,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Close modal and refresh
            document.getElementById('editDeptResourceModal').remove();
            this.showNotification('Department resources updated successfully', 'success');
            this.loadDepartmentResources();
            
        } catch (error) {
            console.error('Error saving edited department resources:', error);
            this.showNotification('Error saving changes', 'error');
        }
    }
    
    async deleteDepartmentResources(docId) {
        if (!confirm('Are you sure you want to delete this department\'s resource configuration? This action cannot be undone.')) {
            return;
        }
        
        try {
            await window.collections.departmentResources.doc(docId).delete();
            this.showNotification('Department resources deleted successfully', 'success');
            this.loadDepartmentResources();
        } catch (error) {
            console.error('Error deleting department resources:', error);
            this.showNotification('Error deleting department resources', 'error');
        }
    }

    async callGeminiAPI(analysisData) {
        // Check if API key is set
        if (!this.geminiApiKey || this.geminiApiKey === '') {
            throw new Error('Gemini API key not configured. Please set it in Settings.');
        }
        
        const prompt = `
        As a hospital resource optimization AI, analyze the following real-time data and provide specific, actionable recommendations in clear, readable format:
        
        Hospital Data:
        - Departments and Resources: ${JSON.stringify(analysisData.departments, null, 2)}
        - Current Patient Load: ${JSON.stringify(analysisData.patientLoad, null, 2)}
        - Bed Occupancy: ${JSON.stringify(analysisData.bedOccupancy, null, 2)}
        
        Please provide recommendations in the following format with clear headings and bullet points:
        
        CRITICAL ALERTS:
        - List any urgent resource shortages or capacity issues
        - Highlight departments at risk
        
        RESOURCE REALLOCATION SUGGESTIONS:
        - Specific recommendations for moving resources between departments
        - Include quantities and reasoning
        
        EFFICIENCY IMPROVEMENTS:
        - Identify underutilized resources
        - Suggest optimization opportunities
        
        COST OPTIMIZATION:
        - Recommendations for reducing waste
        - Suggestions for better resource utilization
        
        Provide clear, actionable recommendations without JSON formatting.
        `;
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${this.geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }
        
        const data = await response.json();
        const aiResponse = data.candidates[0].content.parts[0].text;
        
        // Parse the structured text response
        return this.parseAIResponse(aiResponse);
    }

    parseAIResponse(aiResponse) {
        // Extract sections from the AI response text
        const sections = {
            critical_alerts: [],
            reallocation_suggestions: [],
            efficiency_improvements: [],
            cost_optimizations: []
        };
        
        try {
            // Split response into sections
            const lines = aiResponse.split('\n').filter(line => line.trim());
            let currentSection = null;
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                
                // Identify section headers
                if (trimmedLine.toUpperCase().includes('CRITICAL ALERTS')) {
                    currentSection = 'critical_alerts';
                } else if (trimmedLine.toUpperCase().includes('RESOURCE REALLOCATION') || 
                          trimmedLine.toUpperCase().includes('REALLOCATION SUGGESTIONS')) {
                    currentSection = 'reallocation_suggestions';
                } else if (trimmedLine.toUpperCase().includes('EFFICIENCY IMPROVEMENTS')) {
                    currentSection = 'efficiency_improvements';
                } else if (trimmedLine.toUpperCase().includes('COST OPTIMIZATION')) {
                    currentSection = 'cost_optimizations';
                } else if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•') || 
                          trimmedLine.match(/^\d+\./)) {
                    // This is a bullet point or numbered item
                    if (currentSection && sections[currentSection]) {
                        // Remove bullet point markers and add to appropriate section
                        const cleanText = trimmedLine.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '');
                        if (cleanText.length > 0) {
                            sections[currentSection].push(cleanText);
                        }
                    }
                }
            }
            
            // If no sections were found, put everything in reallocation_suggestions
            if (Object.values(sections).every(arr => arr.length === 0)) {
                sections.reallocation_suggestions = [aiResponse.trim()];
            }
            
        } catch (error) {
            console.error('Error parsing AI response:', error);
            sections.reallocation_suggestions = [aiResponse.trim()];
        }
        
        return sections;
    }

    displayAIRecommendations(recommendations) {
        const container = document.getElementById('aiRecommendations');
        if (!container) return;
        
        container.classList.remove('hidden');
        
        // Helper function to format recommendations
        const formatRecommendations = (items) => {
            if (!items || items.length === 0) {
                return '<li class="text-gray-500 italic">No specific recommendations at this time</li>';
            }
            return items.map(item => `<li class="mb-2">• ${item}</li>`).join('');
        };
        
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Critical Alerts -->
                <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h4 class="font-semibold text-red-800 mb-3 flex items-center">
                        <i class="ri-alarm-warning-line mr-2"></i>
                        Critical Alerts
                    </h4>
                    <ul class="text-red-700 text-sm space-y-1">
                        ${formatRecommendations(recommendations.critical_alerts)}
                    </ul>
                </div>
                
                <!-- Reallocation Suggestions -->
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 class="font-semibold text-blue-800 mb-3 flex items-center">
                        <i class="ri-exchange-line mr-2"></i>
                        Reallocation Suggestions
                    </h4>
                    <ul class="text-blue-700 text-sm space-y-1">
                        ${formatRecommendations(recommendations.reallocation_suggestions)}
                    </ul>
                </div>
                
                <!-- Efficiency Improvements -->
                <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 class="font-semibold text-green-800 mb-3 flex items-center">
                        <i class="ri-line-chart-line mr-2"></i>
                        Efficiency Improvements
                    </h4>
                    <ul class="text-green-700 text-sm space-y-1">
                        ${formatRecommendations(recommendations.efficiency_improvements)}
                    </ul>
                </div>
                
                <!-- Cost Optimizations -->
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 class="font-semibold text-yellow-800 mb-3 flex items-center">
                        <i class="ri-money-dollar-circle-line mr-2"></i>
                        Cost Optimizations
                    </h4>
                    <ul class="text-yellow-700 text-sm space-y-1">
                        ${formatRecommendations(recommendations.cost_optimizations)}
                    </ul>
                </div>
            </div>
            
            <div class="mt-4 text-center">
                <button onclick="document.getElementById('aiRecommendations').classList.add('hidden')" 
                    class="text-white bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg transition">
                    Close Recommendations
                </button>
            </div>
        `;
    }

    // ===== PATIENT RESOURCE ALLOCATION METHODS =====
    
    async allocateResourceToPatient(patientId, resourceType, resourceKey, quantity, departmentId) {
        try {
            // Get department resources
            const snapshot = await window.collections.departmentResources
                .where('departmentId', '==', departmentId)
                .limit(1)
                .get();
                
            if (snapshot.empty) {
                throw new Error('Department resources not found');
            }
            
            const doc = snapshot.docs[0];
            const deptResource = doc.data();
            
            if (!deptResource[resourceType] || !deptResource[resourceType][resourceKey]) {
                throw new Error(`${resourceType} not found: ${resourceKey}`);
            }
            
            if (deptResource[resourceType][resourceKey].available < quantity) {
                throw new Error(`Insufficient ${resourceType} available. Available: ${deptResource[resourceType][resourceKey].available}, Requested: ${quantity}`);
            }
            
            // Update resource allocation
            deptResource[resourceType][resourceKey].available -= quantity;
            deptResource[resourceType][resourceKey].inUse += quantity;
            deptResource.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            
            await doc.ref.update(deptResource);
            
            // Log the allocation
            await window.collections.resourceAllocations.add({
                patientId,
                departmentId,
                resourceType,
                resourceKey,
                resourceName: deptResource[resourceType][resourceKey].name,
                quantity,
                allocatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                allocatedBy: this.currentUser.uid,
                status: 'allocated'
            });
            
            console.log(`Allocated ${quantity} ${resourceKey} to patient ${patientId}`);
            return true;
            
        } catch (error) {
            console.error('Error allocating resource:', error);
            throw error;
        }
    }
    
    async deallocateResourceFromPatient(patientId, resourceType, resourceKey, quantity, departmentId) {
        try {
            // Get department resources
            const snapshot = await window.collections.departmentResources
                .where('departmentId', '==', departmentId)
                .limit(1)
                .get();
                
            if (snapshot.empty) {
                throw new Error('Department resources not found');
            }
            
            const doc = snapshot.docs[0];
            const deptResource = doc.data();
            
            if (!deptResource[resourceType] || !deptResource[resourceType][resourceKey]) {
                throw new Error(`${resourceType} not found: ${resourceKey}`);
            }
            
            if (deptResource[resourceType][resourceKey].inUse < quantity) {
                console.warn(`Attempting to deallocate more than in use. In use: ${deptResource[resourceType][resourceKey].inUse}, Requested: ${quantity}`);
                quantity = deptResource[resourceType][resourceKey].inUse;
            }
            
            // Update resource allocation
            deptResource[resourceType][resourceKey].available += quantity;
            deptResource[resourceType][resourceKey].inUse -= quantity;
            deptResource.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            
            await doc.ref.update(deptResource);
            
            // Update allocation status
            const allocationSnapshot = await window.collections.resourceAllocations
                .where('patientId', '==', patientId)
                .where('resourceKey', '==', resourceKey)
                .where('status', '==', 'allocated')
                .limit(1)
                .get();
                
            if (!allocationSnapshot.empty) {
                await allocationSnapshot.docs[0].ref.update({
                    status: 'deallocated',
                    deallocatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    deallocatedBy: this.currentUser.uid
                });
            }
            
            console.log(`Deallocated ${quantity} ${resourceKey} from patient ${patientId}`);
            return true;
            
        } catch (error) {
            console.error('Error deallocating resource:', error);
            throw error;
        }
    }
    
    async getPatientResourceAllocations(patientId) {
        try {
            const snapshot = await window.collections.resourceAllocations
                .where('patientId', '==', patientId)
                .where('status', '==', 'allocated')
                .get();
                
            const allocations = [];
            snapshot.forEach(doc => {
                allocations.push({ id: doc.id, ...doc.data() });
            });
            
            return allocations;
        } catch (error) {
            console.error('Error getting patient resource allocations:', error);
            return [];
        }
    }
    
    async deallocateAllPatientResources(patientId, departmentId) {
        try {
            const allocations = await this.getPatientResourceAllocations(patientId);
            
            for (const allocation of allocations) {
                await this.deallocateResourceFromPatient(
                    patientId,
                    allocation.resourceType,
                    allocation.resourceKey,
                    allocation.quantity,
                    departmentId
                );
            }
            
            console.log(`Deallocated all resources for patient ${patientId}`);
            return true;
        } catch (error) {
            console.error('Error deallocating all patient resources:', error);
            throw error;
        }
    }
    
    async handlePatientResourceContext(patientId) {
        try {
            // Get patient details
            const patientDoc = await window.collections.patients.doc(patientId).get();
            if (!patientDoc.exists) {
                this.showNotification('Patient not found', 'error');
                return;
            }
            
            const patient = patientDoc.data();
            
            // Show patient context banner
            this.showPatientContextBanner(patientId, patient);
            
            // Filter resources by patient's department
            if (patient.department) {
                this.filters.department = patient.department;
                this.applyFilters();
            }
            
        } catch (error) {
            console.error('Error handling patient context:', error);
        }
    }
    
    showPatientContextBanner(patientId, patient) {
        const banner = document.createElement('div');
        banner.className = 'bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6';
        banner.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <i class="ri-user-3-line text-blue-600"></i>
                    </div>
                    <div>
                        <h4 class="font-semibold text-blue-800">Resource Allocation Context</h4>
                        <p class="text-blue-600 text-sm">Managing resources for: ${patient.firstName} ${patient.lastName} (${patient.departmentName || 'Unknown Department'})</p>
                    </div>
                </div>
                <button onclick="clearPatientContext()" class="text-blue-600 hover:text-blue-800">
                    <i class="ri-close-line"></i>
                </button>
            </div>
        `;
        
        // Insert banner after the top bar
        const container = document.querySelector('.ml-64 .p-6');
        if (container) {
            container.insertBefore(banner, container.firstChild);
        }
        
        // Store patient context globally
        window.currentPatientContext = { id: patientId, ...patient };
    }
    
    async editDepartmentResourcesModal(id) {
        try {
            // Get existing department resource data
            const doc = await window.collections.departmentResources.doc(id).get();
            if (!doc.exists) {
                this.showNotification('Department resources not found', 'error');
                return;
            }
            
            const deptResource = doc.data();
            
            // Open the modal
            openDeptResourceModal();
            
            // Pre-populate the department
            document.getElementById('deptResourceDepartment').value = deptResource.departmentId;
            
            // Pre-populate equipment
            const equipmentSection = document.getElementById('equipmentSection');
            equipmentSection.innerHTML = '';
            
            if (deptResource.equipment && Object.keys(deptResource.equipment).length > 0) {
                Object.entries(deptResource.equipment).forEach(([key, equipment]) => {
                    const row = document.createElement('div');
                    row.className = 'grid grid-cols-1 md:grid-cols-3 gap-3';
                    row.innerHTML = `
                        <input type="text" value="${equipment.name}" placeholder="Equipment name" class="px-3 py-2 border border-gray-300 rounded-lg">
                        <input type="number" value="${equipment.quantity}" placeholder="Quantity" min="1" class="px-3 py-2 border border-gray-300 rounded-lg">
                        <button type="button" onclick="removeRow(this)" class="bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    `;
                    equipmentSection.appendChild(row);
                });
            }
            
            // Add one empty row for equipment
            addEquipmentRow();
            
            // Pre-populate supplies
            const suppliesSection = document.getElementById('suppliesSection');
            suppliesSection.innerHTML = '';
            
            if (deptResource.supplies && Object.keys(deptResource.supplies).length > 0) {
                Object.entries(deptResource.supplies).forEach(([key, supply]) => {
                    const row = document.createElement('div');
                    row.className = 'grid grid-cols-1 md:grid-cols-3 gap-3';
                    row.innerHTML = `
                        <input type="text" value="${supply.name}" placeholder="Supply name" class="px-3 py-2 border border-gray-300 rounded-lg">
                        <input type="number" value="${supply.quantity}" placeholder="Quantity" min="1" class="px-3 py-2 border border-gray-300 rounded-lg">
                        <button type="button" onclick="removeRow(this)" class="bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    `;
                    suppliesSection.appendChild(row);
                });
            }
            
            // Add one empty row for supplies
            addSupplyRow();
            
            // Store the ID for updating
            window.editingDepartmentResourceId = id;
            
        } catch (error) {
            console.error('Error loading department resources for editing:', error);
            this.showNotification('Error loading department resources', 'error');
        }
    }
    
    async deleteDepartmentResources(id) {
        if (!confirm('Are you sure you want to delete all resources for this department? This action cannot be undone.')) {
            return;
        }
        
        try {
            // Get the department resource data first
            const doc = await window.collections.departmentResources.doc(id).get();
            if (!doc.exists) {
                this.showNotification('Department resources not found', 'error');
                return;
            }
            
            const deptResource = doc.data();
            
            // Delete the document
            await window.collections.departmentResources.doc(id).delete();
            
            // Log the activity
            await this.logActivity('dept_resources_deleted', `Deleted all resources for ${deptResource.departmentName}`);
            
            this.showNotification(`All resources deleted for ${deptResource.departmentName}`, 'success');
            
            // Refresh the display
            this.loadDepartmentResources();
            
        } catch (error) {
            console.error('Error deleting department resources:', error);
            this.showNotification('Error deleting department resources', 'error');
        }
    }

    cleanup() {
        this.listeners.forEach(unsubscribe => unsubscribe());
    }
}

// Global functions
function openAddResourceModal() {
    document.getElementById('addResourceModal').classList.remove('hidden');
}

function closeAddResourceModal() {
    document.getElementById('addResourceModal').classList.add('hidden');
    document.getElementById('addResourceForm').reset();
}

// NEW GLOBAL FUNCTIONS FOR DEPARTMENT RESOURCES
function openDeptResourceModal() {
    document.getElementById('deptResourceModal').classList.remove('hidden');
    // Clear existing rows
    document.getElementById('equipmentSection').innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="text" placeholder="Equipment name" class="px-3 py-2 border border-gray-300 rounded-lg">
            <input type="number" placeholder="Quantity" min="1" class="px-3 py-2 border border-gray-300 rounded-lg">
            <button type="button" onclick="addEquipmentRow()" class="bg-green-100 text-green-700 px-3 py-2 rounded-lg hover:bg-green-200">
                <i class="ri-add-line"></i>
            </button>
        </div>
    `;
    document.getElementById('suppliesSection').innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="text" placeholder="Supply name" class="px-3 py-2 border border-gray-300 rounded-lg">
            <input type="number" placeholder="Quantity" min="1" class="px-3 py-2 border border-gray-300 rounded-lg">
            <button type="button" onclick="addSupplyRow()" class="bg-orange-100 text-orange-700 px-3 py-2 rounded-lg hover:bg-orange-200">
                <i class="ri-add-line"></i>
            </button>
        </div>
    `;
}

function closeDeptResourceModal() {
    document.getElementById('deptResourceModal').classList.add('hidden');
    document.getElementById('deptResourceForm').reset();
}

function addEquipmentRow() {
    const section = document.getElementById('equipmentSection');
    const newRow = document.createElement('div');
    newRow.className = 'grid grid-cols-1 md:grid-cols-3 gap-3';
    newRow.innerHTML = `
        <input type="text" placeholder="Equipment name" class="px-3 py-2 border border-gray-300 rounded-lg">
        <input type="number" placeholder="Quantity" min="1" class="px-3 py-2 border border-gray-300 rounded-lg">
        <button type="button" onclick="removeRow(this)" class="bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200">
            <i class="ri-delete-bin-line"></i>
        </button>
    `;
    section.appendChild(newRow);
}

function addSupplyRow() {
    const section = document.getElementById('suppliesSection');
    const newRow = document.createElement('div');
    newRow.className = 'grid grid-cols-1 md:grid-cols-3 gap-3';
    newRow.innerHTML = `
        <input type="text" placeholder="Supply name" class="px-3 py-2 border border-gray-300 rounded-lg">
        <input type="number" placeholder="Quantity" min="1" class="px-3 py-2 border border-gray-300 rounded-lg">
        <button type="button" onclick="removeRow(this)" class="bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200">
            <i class="ri-delete-bin-line"></i>
        </button>
    `;
    section.appendChild(newRow);
}

function removeRow(button) {
    button.parentElement.remove();
}

function openTransferModal() {
    document.getElementById('transferModal').classList.remove('hidden');
}

function closeTransferModal() {
    document.getElementById('transferModal').classList.add('hidden');
    document.getElementById('transferForm').reset();
}

function editDepartmentResources(id) {
    // Get the existing data and pre-populate the modal
    resourceManager.editDepartmentResourcesModal(id);
}

function deleteDepartmentResources(id) {
    if (resourceManager) {
        resourceManager.deleteDepartmentResources(id);
    }
}

function generateAIRecommendations() {
    if (resourceManager) {
        resourceManager.generateAIRecommendations();
    }
}

function allocateResourceToPatient(patientId, resourceType, resourceKey, quantity) {
    if (resourceManager) {
        return resourceManager.allocateResourceToPatient(patientId, resourceType, resourceKey, quantity);
    }
}

function deallocateResourceFromPatient(patientId, resourceType, resourceKey, quantity) {
    if (resourceManager) {
        return resourceManager.deallocateResourceFromPatient(patientId, resourceType, resourceKey, quantity);
    }
}

function clearPatientContext() {
    // Remove patient context banner
    const banner = document.querySelector('.bg-blue-50.border-blue-200');
    if (banner) {
        banner.remove();
    }
    
    // Clear global context
    window.currentPatientContext = null;
    
    // Reset filters
    if (resourceManager) {
        resourceManager.filters.department = '';
        resourceManager.applyFilters();
    }
    
    // Update URL to remove patient parameter
    const url = new URL(window.location);
    url.searchParams.delete('patient');
    window.history.replaceState({}, '', url);
}

function filterByCategory(category) {
    document.getElementById('categoryFilter').value = category;
    resourceManager.filters.category = category;
    resourceManager.applyFilters();
}

function applyFilters() {
    resourceManager.filters.category = document.getElementById('categoryFilter').value;
    resourceManager.currentPage = 1;
    resourceManager.renderResourceTable();
}

function previousPage() {
    if (resourceManager.currentPage > 1) {
        resourceManager.currentPage--;
        resourceManager.renderResourceTable();
    }
}

function nextPage() {
    const filteredResources = resourceManager.getFilteredResources();
    const maxPage = Math.ceil(filteredResources.length / resourceManager.itemsPerPage);
    if (resourceManager.currentPage < maxPage) {
        resourceManager.currentPage++;
        resourceManager.renderResourceTable();
    }
}

async function editResource(resourceId) {
    // Implementation for edit functionality
    console.log('Edit resource:', resourceId);
}

async function deleteResource(resourceId) {
    if (confirm('Are you sure you want to delete this resource?')) {
        try {
            await window.collections.resources.doc(resourceId).delete();
            resourceManager.showNotification('Resource deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting resource:', error);
            resourceManager.showNotification('Error deleting resource', 'error');
        }
    }
}

// Bed management functions moved to beds.js

function refreshBedAvailability() {
    if (window.resourceManager) {
        // Trigger a refresh of bed availability
        window.collections.beds.get().then(snapshot => {
            window.resourceManager.updateBedAvailabilityByDepartment(snapshot);
        });
    }
}

async function exportResourceData() {
    // Generate CSV data
    const resources = resourceManager.getFilteredResources();
    const csv = [
        ['Resource ID', 'Name', 'Category', 'Department', 'Status', 'Quantity', 'Location'],
        ...resources.map(r => [
            r.id,
            r.name,
            r.category,
            r.departmentName || 'N/A',
            r.status,
            r.quantity || 1,
            r.location || 'N/A'
        ])
    ].map(row => row.join(',')).join('\n');
    
    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resources_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Initialize
let resourceManager;
document.addEventListener('DOMContentLoaded', () => {
    resourceManager = new ResourceManager();
    // Make it globally available
    window.resourceManager = resourceManager;
});

// Global functions for HTML button access
function editDepartmentResources(docId) {
    if (window.resourceManager) {
        window.resourceManager.editDepartmentResources(docId);
    }
}

function deleteDepartmentResources(docId) {
    if (window.resourceManager) {
        window.resourceManager.deleteDepartmentResources(docId);
    }
}

function generateAIRecommendations() {
    if (window.resourceManager) {
        window.resourceManager.generateAIRecommendations();
    }
}

// Cleanup
window.addEventListener('beforeunload', () => {
    if (resourceManager) {
        resourceManager.cleanup();
    }
});