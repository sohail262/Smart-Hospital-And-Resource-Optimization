class StaffManager {
    constructor() {
        this.staff = [];
        this.unsubscribe = null;
        this.init();
    }

    async init() {
        await this.checkAuth();
        await this.loadDepartments();
        this.setupListeners();
        this.bindUI();
    }

    async checkAuth() {
        return new Promise((resolve) => {
            auth.onAuthStateChanged(user => {
                if (user) resolve(user); else window.location.href = 'index.html';
            });
        });
    }

    async loadDepartments() {
        const selects = [document.getElementById('staffDepartment'), document.getElementById('staffDeptFilter')];
        const snapshot = await window.collections.departments.get();
        snapshot.forEach(doc => {
            const d = doc.data();
            selects.forEach(sel => {
                if (!sel) return;
                sel.innerHTML += `<option value="${doc.id}">${d.name}</option>`;
            });
        });
    }

    setupListeners() {
        this.unsubscribe = window.collections.staff.onSnapshot(snap => {
            this.staff = [];
            let onDuty = 0, doctors = 0, nurses = 0;
            snap.forEach(doc => {
                const s = { id: doc.id, ...doc.data() };
                this.staff.push(s);
                if (s.status === 'on-duty') onDuty++;
                if (s.role === 'doctor') doctors++;
                if (s.role === 'nurse') nurses++;
            });
            document.getElementById('onDutyCount').textContent = onDuty;
            document.getElementById('doctorCount').textContent = doctors;
            document.getElementById('nurseCount').textContent = nurses;
            this.renderTable();
        });
    }

    bindUI() {
        document.getElementById('staffSearch').addEventListener('input', () => this.renderTable());
        document.getElementById('staffDeptFilter').addEventListener('change', () => this.renderTable());
        document.getElementById('staffRoleFilter').addEventListener('change', () => this.renderTable());
        document.getElementById('staffStatusFilter').addEventListener('change', () => this.renderTable());

        document.getElementById('addStaffForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editingStaffId').value;
            const payload = {
                name: document.getElementById('staffName').value,
                email: document.getElementById('staffEmail').value || '',
                role: document.getElementById('staffRole').value,
                department: document.getElementById('staffDepartment').value,
                status: document.getElementById('staffStatus').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            payload.departmentName = (await window.collections.departments.doc(payload.department).get()).data()?.name || '';
            if (id) {
                await window.collections.staff.doc(id).update(payload);
            } else {
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await window.collections.staff.add(payload);
            }
            closeAddStaffModal();
        });
    }

    renderTable() {
        const tbody = document.getElementById('staffTableBody');
        const q = document.getElementById('staffSearch').value.toLowerCase();
        const d = document.getElementById('staffDeptFilter').value;
        const r = document.getElementById('staffRoleFilter').value;
        const s = document.getElementById('staffStatusFilter').value;

        const rows = this.staff.filter(x => (
            (!q || (x.name||'').toLowerCase().includes(q) || (x.email||'').toLowerCase().includes(q)) &&
            (!d || x.department === d) &&
            (!r || x.role === r) &&
            (!s || x.status === s)
        ));

        tbody.innerHTML = rows.map(item => `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4">
                    <div class="flex items-center">
                        <div class="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center mr-3"><i class="ri-user-3-line"></i></div>
                        <div>
                            <div class="font-medium">${item.name || 'N/A'}</div>
                            <div class="text-xs text-gray-500">${item.email || ''}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-sm">${item.role}</td>
                <td class="px-6 py-4 text-sm">${item.departmentName || ''}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-full text-xs bg-${item.status==='on-duty'?'green':'gray'}-100 text-${item.status==='on-duty'?'green':'gray'}-800">${item.status}</span>
                </td>
                <td class="px-6 py-4 text-sm">
                    <button class="text-indigo-600 mr-3" onclick="editStaff('${item.id}')"><i class="ri-edit-line"></i></button>
                    <button class="text-${item.status==='on-duty'?'red':'green'}-600" onclick="toggleDuty('${item.id}')"><i class="ri-${item.status==='on-duty'?'pause':'play'}-circle-line"></i></button>
                </td>
            </tr>
        `).join('');
    }
}

let staffManager;
document.addEventListener('DOMContentLoaded', () => {
    staffManager = new StaffManager();
});

function openAddStaffModal() {
    document.getElementById('staffModalTitle').textContent = 'Add Staff';
    document.getElementById('editingStaffId').value = '';
    document.getElementById('addStaffForm').reset();
    document.getElementById('addStaffModal').classList.remove('hidden');
    document.getElementById('addStaffModal').classList.add('flex');
}

function closeAddStaffModal() {
    document.getElementById('addStaffModal').classList.add('hidden');
    document.getElementById('addStaffModal').classList.remove('flex');
}

async function editStaff(id) {
    const doc = await window.collections.staff.doc(id).get();
    if (!doc.exists) return;
    const s = doc.data();
    document.getElementById('staffModalTitle').textContent = 'Edit Staff';
    document.getElementById('editingStaffId').value = id;
    document.getElementById('staffName').value = s.name || '';
    document.getElementById('staffEmail').value = s.email || '';
    document.getElementById('staffRole').value = s.role || 'doctor';
    document.getElementById('staffDepartment').value = s.department || '';
    document.getElementById('staffStatus').value = s.status || 'off-duty';
    document.getElementById('addStaffModal').classList.remove('hidden');
    document.getElementById('addStaffModal').classList.add('flex');
}

async function toggleDuty(id) {
    const doc = await window.collections.staff.doc(id).get();
    if (!doc.exists) return;
    const status = doc.data().status === 'on-duty' ? 'off-duty' : 'on-duty';
    await window.collections.staff.doc(id).update({ status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}


