/**
 * Control de Combustible — Dashboard Frontend
 * Uses Cloudflare Worker API for data persistence
 */

const app = (() => {
    // API Configuration
    const API_BASE = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';

    // ---- Venezuela Time (GMT-4) ----
    function getVenezuelaDate() {
        const now = new Date();
        return new Date(now.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
    }

    function getDateKey() {
        const d = getVenezuelaDate();
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    }

    function getYesterdayKey() {
        const d = getVenezuelaDate();
        d.setDate(d.getDate() - 1);
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    }

    function formatTime() {
        const now = new Date();
        return now.toLocaleTimeString('es-VE', {
            timeZone: 'America/Caracas',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    function formatDateDisplay(key) {
        const [y, m, d] = key.split('/');
        return `${d}/${m}/${y}`;
    }

    // ---- API Layer ----
    async function apiGet(endpoint) {
        const res = await fetch(`${API_BASE}${endpoint}`);
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    }

    async function apiPost(endpoint, body) {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    }

    async function apiPut(endpoint) {
        const res = await fetch(`${API_BASE}${endpoint}`, { method: 'PUT' });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    }

    async function apiDelete(endpoint) {
        const res = await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    }

    // ---- Data Operations (API calls) ----
    async function apiLoadDayData(dateKey = null) {
        const key = dateKey || getDateKey();
        return apiGet(`/api/data/${key}`);
    }

    async function apiSaveIngreso(dateKey, amount) {
        return apiPost(`/api/data/${dateKey}/ingreso`, { amount });
    }

    async function apiSaveDriver(dateKey, driver) {
        return apiPost(`/api/data/${dateKey}/drivers`, driver);
    }

    async function apiDeleteDriver(dateKey, driverId) {
        return apiDelete(`/api/data/${dateKey}/drivers/${driverId}`);
    }

    async function apiDeliverDriver(dateKey, driverId) {
        return apiPut(`/api/data/${dateKey}/drivers/${driverId}/deliver`);
    }

    async function apiResetToday() {
        return apiPost('/api/reset/today', {});
    }

    async function apiFullReset() {
        return apiPost('/api/reset/all', {});
    }

    // ---- UI Updates ----
    function updateClock() {
        const el = document.getElementById('venezuelaTime');
        if (el) el.textContent = formatTime();
    }

    function formatNumber(n) {
        return Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    function updateStats(dayData, dateKey) {
        document.getElementById('statIngreso').textContent = formatNumber(dayData.ingreso);
        document.getElementById('statAsignado').textContent = formatNumber(dayData.asignado);
        document.getElementById('statAlmacenado').textContent = formatNumber(dayData.almacenado);
        document.getElementById('currentDate').textContent = formatDateDisplay(dateKey);

        updateCan(dayData.ingreso, dayData.almacenado);
    }

    function updateCan(ingreso, almacenado) {
        const capacity = Math.max(ingreso, 1);
        const percent = Math.max(0, Math.min(100, (almacenado / capacity) * 100));

        // Can fill: SVG rect y=42 to y=280 (height 238)
        const fillHeight = (percent / 100) * 238;
        const fillY = 280 - fillHeight;

        const fuelRect = document.getElementById('canFuel');
        const wave = document.getElementById('canWave');
        const percentText = document.getElementById('canPercent');
        const capacityText = document.getElementById('canCapacity');
        const currentText = document.getElementById('canCurrent');
        const maxText = document.getElementById('canMax');

        if (fuelRect) {
            fuelRect.setAttribute('y', fillY);
            fuelRect.setAttribute('height', fillHeight);
        }
        if (wave) {
            wave.setAttribute('d', `M30 ${fillY} Q50 ${fillY - 4} 85 ${fillY} Q120 ${fillY + 4} 155 ${fillY} Q190 ${fillY - 4} 210 ${fillY} L210 ${fillY} L30 ${fillY} Z`);
        }
        if (percentText) percentText.textContent = `${Math.round(percent)}%`;
        if (capacityText) capacityText.textContent = `${formatNumber(almacenado)} / ${formatNumber(capacity)} L`;
        if (currentText) currentText.textContent = `${formatNumber(almacenado)} L`;
        if (maxText) maxText.textContent = `${formatNumber(capacity)} L`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function renderDrivers(dayData) {
        const tbody = document.getElementById('driversBody');
        const emptyState = document.getElementById('emptyState');

        if (!dayData.drivers.length) {
            tbody.innerHTML = '';
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';
        tbody.innerHTML = dayData.drivers.map(driver => `
            <tr>
                <td>
                    <div class="driver-info">
                        <span class="driver-name">${escapeHtml(driver.name)}</span>
                        <span class="driver-vehicle">${escapeHtml(driver.vehicle)}</span>
                    </div>
                </td>
                <td class="text-center">
                    <span class="liters-badge ${driver.delivered ? 'delivered' : 'pending'}">
                        ${formatNumber(driver.liters)} L
                    </span>
                </td>
                <td class="text-center">
                    <div class="driver-actions">
                        ${!driver.delivered ? `
                            <button class="btn-action deliver" onclick="app.deliverDriver('${driver.id}')" title="Marcar entregado">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                </svg>
                            </button>
                        ` : `
                            <span class="delivered-badge">✓ Entregado</span>
                        `}
                        <button class="btn-action delete" onclick="app.deleteDriver('${driver.id}')" title="Eliminar">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                <path d="M4 4l1 9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    // ---- Modals ----
    function openModal(id) {
        document.getElementById(id).classList.add('active');
    }

    function closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    function showDriverForm() {
        document.getElementById('driverForm').reset();
        openModal('modalDriver');
        setTimeout(() => document.getElementById('driverName').focus(), 100);
    }

    function closeDriverForm() {
        closeModal('modalDriver');
    }

    function showIngresoForm() {
        document.getElementById('ingresoForm').reset();
        document.getElementById('ingresoDate').value = getDateKey().replace(/\//g, '-');
        openModal('modalIngreso');
        setTimeout(() => document.getElementById('ingresoAmount').focus(), 100);
    }

    function closeIngresoForm() {
        closeModal('modalIngreso');
    }

    function showConfirm(title, message, onConfirm) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('confirmBtn').onclick = () => {
            onConfirm();
            closeConfirm();
        };
        openModal('modalConfirm');
    }

    function closeConfirm() {
        closeModal('modalConfirm');
    }

    // ---- Actions ----
    async function saveDriver(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const name = document.getElementById('driverName').value.trim();
        const vehicle = document.getElementById('driverVehicle').value.trim();
        const liters = parseFloat(document.getElementById('driverLiters').value) || 0;

        if (!name || !vehicle || liters <= 0) return;

        const dateKey = getDateKey();
        const driver = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
            name,
            vehicle,
            liters,
            delivered: false,
            timestamp: new Date().toISOString()
        };

        try {
            const dayData = await apiSaveDriver(dateKey, driver);
            closeDriverForm();
            refresh(dayData, dateKey);
        } catch (err) {
            console.error('Error saving driver:', err);
            alert('Error al guardar chofer');
        }
    }

    async function deleteDriver(id) {
        showConfirm(
            'Eliminar chofer',
            '¿Eliminar este registro? Los litros se restarán del total asignado.',
            async () => {
                try {
                    const dateKey = getDateKey();
                    const dayData = await apiDeleteDriver(dateKey, id);
                    refresh(dayData, dateKey);
                } catch (err) {
                    console.error('Error deleting driver:', err);
                    alert('Error al eliminar chofer');
                }
            }
        );
    }

    async function deliverDriver(id) {
        showConfirm(
            'Marcar como entregado',
            '¿Confirmar la entrega de combustible a este chofer?',
            async () => {
                try {
                    const dateKey = getDateKey();
                    const dayData = await apiDeliverDriver(dateKey, id);
                    refresh(dayData, dateKey);
                } catch (err) {
                    console.error('Error delivering:', err);
                    alert('Error al marcar entregado');
                }
            }
        );
    }

    async function saveIngreso(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const amount = parseFloat(document.getElementById('ingresoAmount').value) || 0;
        const dateStr = document.getElementById('ingresoDate').value;
        const dateKey = dateStr.replace(/-/g, '/');

        if (amount <= 0) return;

        try {
            const dayData = await apiSaveIngreso(dateKey, amount);
            closeIngresoForm();
            refresh(dayData, dateKey);
        } catch (err) {
            console.error('Error saving ingreso:', err);
            alert('Error al ingresar litros');
        }
    }

    async function doResetToday() {
        showConfirm(
            'Reiniciar hoy',
            'Pondrá ingreso, asignado y almacenado de hoy a 0. ¿Continuar?',
            async () => {
                try {
                    const dayData = await apiResetToday();
                    refresh(dayData, getDateKey());
                } catch (err) {
                    console.error('Error resetting today:', err);
                    alert('Error al reiniciar hoy');
                }
            }
        );
    }

    async function doFullReset() {
        showConfirm(
            'Reinicio completo',
            'Esto borrará TODOS los datos de todos los días. ¿Está completamente seguro?',
            async () => {
                try {
                    await apiFullReset();
                    const dayData = await apiLoadDayData();
                    refresh(dayData, getDateKey());
                } catch (err) {
                    console.error('Error full reset:', err);
                    alert('Error al reiniciar todo');
                }
            }
        );
    }

    // ---- Refresh ----
    function refresh(dayData, dateKey) {
        updateStats(dayData, dateKey);
        renderDrivers(dayData);
    }

    async function loadAndRefresh() {
        try {
            const dateKey = getDateKey();
            const dayData = await apiLoadDayData(dateKey);
            refresh(dayData, dateKey);
        } catch (err) {
            console.error('Error loading data:', err);
        }
    }

    // ---- Init ----
    function init() {
        updateClock();
        setInterval(updateClock, 1000);
        loadAndRefresh();

        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.classList.remove('active');
            });
        });

        // ESC to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
            }
        });
    }

    return {
        init,
        showDriverForm,
        closeDriverForm,
        showIngresoForm,
        closeIngresoForm,
        saveDriver,
        saveIngreso,
        deleteDriver,
        deliverDriver,
        resetToday: doResetToday,
        fullReset: doFullReset,
        closeConfirm
    };
})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => app.init());