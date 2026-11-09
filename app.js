let menuData = [];
let rolesData = {};
let currentRole = null;

// Initialize Storage if empty
if (!localStorage.getItem('restaurant_cooked_logs')) {
    localStorage.setItem('restaurant_cooked_logs', JSON.stringify([]));
}
if (!localStorage.getItem('restaurant_sold_logs')) {
    localStorage.setItem('restaurant_sold_logs', JSON.stringify([]));
}

// Fetch Menu & Roles on startup
document.addEventListener('DOMContentLoaded', () => {
    Promise.all([
        fetch('menu.json').then(res => res.json()),
        fetch('roles.json').then(res => res.json())
    ]).then(([menu, roles]) => {
        menuData = menu;
        rolesData = roles.roles;
        renderPublicMenu();
        populateItemSelects();
    }).catch(err => console.error("Error loading JSON files:", err));
});

// Render Public Menu
function renderPublicMenu(filterCategory = 'All') {
    const grid = document.getElementById('menu-grid');
    const filterBar = document.getElementById('category-filter');
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

// Populate Select Dropdowns
function populateItemSelects() {
    const chefSelect = document.getElementById('chef-item-select');
    const waiterSelect = document.getElementById('waiter-item-select');

    const options = menuData.map(item => `<option value="${item.id}">${item.id}. ${item.name}</option>`).join('');
    chefSelect.innerHTML = options;
    waiterSelect.innerHTML = options;

    handleWaiterItemChange();
}

function handleWaiterItemChange() {
    const itemId = parseInt(document.getElementById('waiter-item-select').value);
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

// Modals & Authentication
function openLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
}

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

function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(sec => sec.style.display = 'none');
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'block';

    if (viewId === 'chef-portal') renderChefLogs();
    if (viewId === 'waiter-portal') renderWaiterLogs();
    if (viewId === 'admin-portal') renderAdminDashboard();
    if (viewId === 'owner-portal') renderOwnerDashboard();
}

// Chef Logic (Cooked items logging)
document.getElementById('chef-form').addEventListener('submit', (e) => {
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

    const logs = JSON.parse(localStorage.getItem('restaurant_cooked_logs'));
    logs.push(log);
    localStorage.setItem('restaurant_cooked_logs', JSON.stringify(logs));

    alert('রান্না এনট্রি সফলভাবে সেভ হয়েছে!');
    renderChefLogs();
});

function renderChefLogs() {
    const logs = JSON.parse(localStorage.getItem('restaurant_cooked_logs'));
    const tbody = document.getElementById('chef-log-tbody');
    tbody.innerHTML = logs.slice().reverse().map(l => `
        <tr>
            <td>${l.timestamp}</td>
            <td>${l.itemName}</td>
            <td>${l.quantity}</td>
        </tr>
    `).join('');
}

// Waiter Logic (Sold items logging)
document.getElementById('waiter-form').addEventListener('submit', (e) => {
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

    const totalPrice = unitPrice * qty;

    const log = {
        timestamp: new Date().toLocaleString('bn-BD'),
        itemId: item.id,
        itemName: item.name + (sizeSelected ? ` (${sizeSelected})` : ''),
        quantity: qty,
        totalPrice: totalPrice
    };

    const logs = JSON.parse(localStorage.getItem('restaurant_sold_logs'));
    logs.push(log);
    localStorage.setItem('restaurant_sold_logs', JSON.stringify(logs));

    alert('বিক্রি এনট্রি সফলভাবে সেভ হয়েছে!');
    renderWaiterLogs();
});

function renderWaiterLogs() {
    const logs = JSON.parse(localStorage.getItem('restaurant_sold_logs'));
    const tbody = document.getElementById('waiter-log-tbody');
    tbody.innerHTML = logs.slice().reverse().map(l => `
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
    const cookedLogs = JSON.parse(localStorage.getItem('restaurant_cooked_logs'));
    const soldLogs = JSON.parse(localStorage.getItem('restaurant_sold_logs'));

    let totalRevenue = soldLogs.reduce((sum, l) => sum + l.totalPrice, 0);
    let totalCooked = cookedLogs.reduce((sum, l) => sum + l.quantity, 0);
    let totalSold = soldLogs.reduce((sum, l) => sum + l.quantity, 0);

    document.getElementById('stat-total-revenue').innerText = `৳ ${totalRevenue}`;
    document.getElementById('stat-total-cooked').innerText = totalCooked;
    document.getElementById('stat-total-sold').innerText = totalSold;

    const tbody = document.getElementById('admin-summary-tbody');
    tbody.innerHTML = menuData.map(item => {
        let cookedQty = cookedLogs.filter(l => l.itemId === item.id).reduce((sum, l) => sum + l.quantity, 0);
        let soldItems = soldLogs.filter(l => l.itemId === item.id);
        let soldQty = soldItems.reduce((sum, l) => sum + l.quantity, 0);
        let revenue = soldItems.reduce((sum, l) => sum + l.totalPrice, 0);

        return `
            <tr>
                <td>#${item.id} ${item.name}</td>
                <td>${cookedQty}</td>
                <td>${soldQty}</td>
                <td>${cookedQty - soldQty}</td>
                <td>৳ ${revenue}</td>
            </tr>
        `;
    }).join('');
}

// Owner Dashboard & JSON Export
function renderOwnerDashboard() {
    const cookedLogs = JSON.parse(localStorage.getItem('restaurant_cooked_logs')).map(l => ({...l, type: 'Cooked', price: '-'}));
    const soldLogs = JSON.parse(localStorage.getItem('restaurant_sold_logs')).map(l => ({...l, type: 'Sold', price: `৳ ${l.totalPrice}`}));

    const totalRevenue = soldLogs.reduce((sum, l) => sum + (parseInt(l.price.replace('৳ ', '')) || 0), 0);
    document.getElementById('owner-stat-revenue').innerText = `৳ ${totalRevenue}`;
    document.getElementById('owner-stat-logs').innerText = cookedLogs.length + soldLogs.length;

    const combined = [...cookedLogs, ...soldLogs].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

    const tbody = document.getElementById('owner-all-logs-tbody');
    tbody.innerHTML = combined.map(l => `
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
    const data = {
        cooked_logs: JSON.parse(localStorage.getItem('restaurant_cooked_logs')),
        sold_logs: JSON.parse(localStorage.getItem('restaurant_sold_logs')),
        exported_at: new Date().toLocaleString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sopno_fast_food_backup_${Date.now()}.json`;
    a.click();
          }
                                       
