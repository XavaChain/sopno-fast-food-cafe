let menuData = [];
let rolesData = {};
let currentRole = null;
let cookedLogs = [];
let soldLogs = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Always load static menu.json and roles.json FIRST (Guarantees menu never breaks!)
    Promise.all([
        fetch('menu.json').then(res => res.json()),
        fetch('roles.json').then(res => res.json())
    ]).then(([menu, roles]) => {
        menuData = menu;
        rolesData = roles.roles;
        renderPublicMenu();
        populateItemSelects();
        loadDatabaseFromJSON();
    }).catch(err => console.error("Initialization error:", err));
});

// Load logs from GitHub backend
async function loadDatabaseFromJSON() {
    try {
        const [cookedRes, soldRes] = await Promise.all([
            fetch('/api/save?type=cooked'),
            fetch('/api/save?type=sold')
        ]);

        if (cookedRes.ok) cookedLogs = await cookedRes.json();
        if (soldRes.ok) soldLogs = await soldRes.json();

        // Fallback to local storage if API returned empty
        if (!cookedLogs || cookedLogs.length === 0) {
            cookedLogs = JSON.parse(localStorage.getItem('restaurant_cooked_logs') || '[]');
        }
        if (!soldLogs || soldLogs.length === 0) {
            soldLogs = JSON.parse(localStorage.getItem('restaurant_sold_logs') || '[]');
        }
    } catch (err) {
        console.warn("API load failed, using local cache.", err);
        cookedLogs = JSON.parse(localStorage.getItem('restaurant_cooked_logs') || '[]');
        soldLogs = JSON.parse(localStorage.getItem('restaurant_sold_logs') || '[]');
    }
}

// Save entry to GitHub and Local Backup
async function saveToJSONFile(type, logEntry) {
    // Save to local backup immediately
    if (type === 'cooked') {
        cookedLogs.push(logEntry);
        localStorage.setItem('restaurant_cooked_logs', JSON.stringify(cookedLogs));
    } else {
        soldLogs.push(logEntry);
        localStorage.setItem('restaurant_sold_logs', JSON.stringify(soldLogs));
    }

    try {
        const res = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: type, log: logEntry })
        });
        const result = await res.json();
        if (res.ok && result.success) {
            return { success: true };
        } else {
            return { 
                success: false, 
                error: result.error || 'GitHub Save Warning', 
                details: result.details || 'Saved locally on device.' 
            };
        }
    } catch (err) {
        return { success: false, error: err.message, details: 'Saved locally on device.' };
    }
}

// Render Public Menu
function renderPublicMenu(filterCategory = 'All') {
    const grid = document.getElementById('menu-grid');
    const filterBar = document.getElementById('category-filter');
    if (!grid || !filterBar) return;
    grid.innerHTML = '';

    const categories = ['All', ...new Set(menuData.map(i => i.category))];

    filterBar.innerHTML = categories.map(cat => `
        <button class="filter-chip ${cat === filterCategory ? 'active' : ''}" onclick="renderPublicMenu('${cat}')">${cat}</button>
    `).join('');

    const filtered = filterCategory === 'All' ? menuData : menuData.filter(i => i.category === filterCategory);

    filtered.forEach(item => {
        let priceText = item.price ? `৳ ${item.price}` : Object.entries(item.prices).map(([sz, p]) => `${sz}: ৳${p}`).join(' | ');
        grid.innerHTML += `
            <div class="menu-card">
                <span class="category">#${item.id} | ${item.category}</span>
                <h3>${item.name}</h3>
                <div class="price">${priceText}</div>
            </div>
        `;
    });
}

function populateItemSelects() {
    const chefSelect = document.getElementById('chef-item-select');
    const waiterSelect = document.getElementById('waiter-item-select');
    if (!chefSelect || !waiterSelect) return;

    const options = menuData.map(item => `<option value="${item.id}">${item.id}. ${item.name}</option>`).join('');
    chefSelect.innerHTML = options;
    waiterSelect.innerHTML = options;
    handleWaiterItemChange();
}

function handleWaiterItemChange() {
    const selectElem = document.getElementById('waiter-item-select');
    if (!selectElem || !selectElem.value) return;

    const itemId = parseInt(selectElem.value);
    const item = menuData.find(i => i.id === itemId);
    const sizeContainer = document.getElementById('waiter-size-container');
    const sizeSelect = document.getElementById('waiter-size-select');

    if (item && item.prices) {
        sizeContainer.style.display = 'block';
        sizeSelect.innerHTML = Object.keys(item.prices).map(size => `<option value="${size}">${size} (৳${item.prices[size]})</option>`).join('');
    } else {
        sizeContainer.style.display = 'none';
        sizeSelect.innerHTML = '';
    }
}

// Authentication
function openLoginModal() { document.getElementById('login-modal').style.display = 'flex'; }
function closeLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('login-error').innerText = '';
}

function authenticateRole() {
    const pwd = document.getElementById('role-password').value.trim();
    let foundRole = null;

    for (const [key, roleObj] of Object.entries(rolesData)) {
        if (roleObj.password === pwd) {
            foundRole = key;
            break;
        }
    }

    if (foundRole) {
        currentRole = foundRole;
        closeLoginModal();
        document.getElementById('role-password').value = '';
        document.getElementById('login-trigger').style.display = 'none';
        document.getElementById('logout-trigger').style.display = 'inline-block';
        document.getElementById('hero-section').style.display = 'none';
        switchView(`${currentRole}-portal`);
    } else {
        document.getElementById('login-error').innerText = 'ভুল পাসওয়ার্ড! সঠিক পাসওয়ার্ড দিন।';
    }
}

function logout() {
    currentRole = null;
    document.getElementById('login-trigger').style.display = 'inline-block';
    document.getElementById('logout-trigger').style.display = 'none';
    document.getElementById('hero-section').style.display = 'flex';
    switchView('public-menu');
}

async function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(sec => sec.style.display = 'none');
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'block';

    await loadDatabaseFromJSON();

    if (viewId === 'chef-portal') renderChefLogs();
    if (viewId === 'waiter-portal') renderWaiterLogs();
    if (viewId === 'admin-portal') renderAdminDashboard();
    if (viewId === 'owner-portal') renderOwnerDashboard();
}

// Chef Submit
document.getElementById('chef-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = parseInt(document.getElementById('chef-item-select').value);
    const qty = parseInt(document.getElementById('chef-qty').value);
    const item = menuData.find(i => i.id === itemId);

    const log = {
        timestamp: new Date().toLocaleString('bn-BD'),
        itemId: item.id,
        itemName: item.name,
        quantity: qty
    };

    const res = await saveToJSONFile('cooked', log);
    renderChefLogs();
    if (res.success) {
        alert('রান্না এনট্রি cooked.json এ সেভ হয়েছে!');
    } else {
        alert(`লোকালি সেভ হয়েছে! (GitHub সঙ্কলন সতর্কবার্তা: ${res.error})`);
    }
});

function renderChefLogs() {
    const tbody = document.getElementById('chef-log-tbody');
    tbody.innerHTML = (cookedLogs || []).slice().reverse().map(l => `
        <tr>
            <td>${l.timestamp}</td>
            <td>${l.itemName}</td>
            <td>${l.quantity}</td>
        </tr>
    `).join('');
}

// Waiter Submit
document.getElementById('waiter-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = parseInt(document.getElementById('waiter-item-select').value);
    const qty = parseInt(document.getElementById('waiter-qty').value);
    const item = menuData.find(i => i.id === itemId);

    let unitPrice = item.price;
    let sizeSelected = '';

    if (item.prices) {
        sizeSelected = document.getElementById('waiter-size-select').value;
        unitPrice = item.prices[sizeSelected];
    }

    const log = {
        timestamp: new Date().toLocaleString('bn-BD'),
        itemId: item.id,
        itemName: item.name + (sizeSelected ? ` (${sizeSelected})` : ''),
        quantity: qty,
        totalPrice: unitPrice * qty
    };

    const res = await saveToJSONFile('sold', log);
    renderWaiterLogs();
    if (res.success) {
        alert('বিক্রি এনট্রি sold.json এ সেভ হয়েছে!');
    } else {
        alert(`লোকালি সেভ হয়েছে! (GitHub সঙ্কলন সতর্কবার্তা: ${res.error})`);
    }
});

function renderWaiterLogs() {
    const tbody = document.getElementById('waiter-log-tbody');
    tbody.innerHTML = (soldLogs || []).slice().reverse().map(l => `
        <tr>
            <td>${l.timestamp}</td>
            <td>${l.itemName}</td>
            <td>${l.quantity}</td>
            <td>৳ ${l.totalPrice}</td>
        </tr>
    `).join('');
}

// Admin Dashboard
function renderAdminDashboard() {
    let totalRevenue = soldLogs.reduce((sum, l) => sum + l.totalPrice, 0);
    let totalCooked = cookedLogs.reduce((sum, l) => sum + l.quantity, 0);
    let totalSold = soldLogs.reduce((sum, l) => sum + l.quantity, 0);

    document.getElementById('stat-total-revenue').innerText = `৳ ${totalRevenue}`;
    document.getElementById('stat-total-cooked').innerText = totalCooked;
    document.getElementById('stat-total-sold').innerText = totalSold;

    const tbody = document.getElementById('admin-summary-tbody');
    tbody.innerHTML = menuData.map(item => {
        let itemCookedQty = cookedLogs.filter(l => l.itemId === item.id).reduce((sum, l) => sum + l.quantity, 0);
        let itemSoldEntries = soldLogs.filter(l => l.itemId === item.id);
        let itemSoldQty = itemSoldEntries.reduce((sum, l) => sum + l.quantity, 0);
        let revenue = itemSoldEntries.reduce((sum, l) => sum + l.totalPrice, 0);

        return `
            <tr>
                <td>#${item.id} ${item.name}</td>
                <td>${itemCookedQty}</td>
                <td>${itemSoldQty}</td>
                <td>${itemCookedQty - itemSoldQty}</td>
                <td>৳ ${revenue}</td>
            </tr>
        `;
    }).join('');
}

// Owner Dashboard
function renderOwnerDashboard() {
    const cooked = cookedLogs.map(l => ({...l, type: 'Cooked', price: '-'}));
    const sold = soldLogs.map(l => ({...l, type: 'Sold', price: `৳ ${l.totalPrice}`}));

    const totalRevenue = soldLogs.reduce((sum, l) => sum + l.totalPrice, 0);
    document.getElementById('owner-stat-revenue').innerText = `৳ ${totalRevenue}`;
    document.getElementById('owner-stat-logs').innerText = cooked.length + sold.length;

    const combined = [...cooked, ...sold];
    const tbody = document.getElementById('owner-all-logs-tbody');
    tbody.innerHTML = combined.slice().reverse().map(l => `
        <tr>
            <td><strong>${l.type}</strong></td>
            <td>${l.timestamp}</td>
            <td>${l.itemName}</td>
            <td>${l.quantity}</td>
            <td>${l.price}</td>
        </tr>
    `).join('');
}

function exportJSONData() {
    const data = { cooked_logs: cookedLogs, sold_logs: soldLogs };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sopno_restaurant_data_${Date.now()}.json`;
    a.click();
}
