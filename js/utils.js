/**
 * utils.js - 通用工具函数
 */

var Utils = (function() {
    // Toast 提示
    function showToast(msg, duration) {
        duration = duration || 2000;
        var toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.style.display = 'block';
        setTimeout(function() {
            toast.style.display = 'none';
        }, duration);
    }

    // 格式化日期
    function formatDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.getFullYear() + '-' 
            + String(d.getMonth()+1).padStart(2,'0') + '-' 
            + String(d.getDate()).padStart(2,'0');
    }

    // 格式化时间
    function formatDateTime(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.getFullYear() + '-' 
            + String(d.getMonth()+1).padStart(2,'0') + '-' 
            + String(d.getDate()).padStart(2,'0') + ' '
            + String(d.getHours()).padStart(2,'0') + ':'
            + String(d.getMinutes()).padStart(2,'0');
    }

    // 获取今日日期字符串
    function today() {
        var d = new Date();
        return d.getFullYear() + '年' 
            + (d.getMonth()+1) + '月' 
            + d.getDate() + '日';
    }

    // 转义HTML
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // 生成唯一ID
    function genId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // 获取区域/乡镇/村屯选项
    function getFilterOptions(stations) {
        var areas = {}, towns = {}, villages = {};
        stations.forEach(function(s) {
            if (s.county) areas[s.county] = 1;
            if (s.town) towns[s.town] = 1;
            if (s.village) villages[s.village] = 1;
        });
        return {
            areas: Object.keys(areas).sort(),
            towns: Object.keys(towns).sort(),
            villages: Object.keys(villages).sort()
        };
    }

    // 深度筛选
    function filterStations(stations, area, town, village, keyword) {
        return stations.filter(function(s) {
            if (area && s.county !== area) return false;
            if (town && s.town !== town) return false;
            if (village && s.village !== village) return false;
            if (keyword) {
                var kw = keyword.toLowerCase();
                var text = [s.name, s.county, s.town, s.village, s.location].join(' ').toLowerCase();
                if (text.indexOf(kw) < 0) return false;
            }
            return true;
        });
    }

    // 更新下拉框选项
    function updateSelect(selectId, options, currentVal) {
        var sel = document.getElementById(selectId);
        if (!sel) return;
        var firstOpt = sel.options[0];
        sel.innerHTML = '';
        sel.appendChild(firstOpt);
        options.forEach(function(opt) {
            var o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            sel.appendChild(o);
        });
        if (currentVal) sel.value = currentVal;
    }

    // 显示确认框
    var _confirmCallback = null;
    function showConfirm(title, content, onConfirm) {
        document.getElementById('dialogTitle').textContent = title;
        document.getElementById('dialogContent').textContent = content;
        document.getElementById('confirmDialog').style.display = 'flex';
        _confirmCallback = onConfirm;
    }

    function confirmAction() {
        document.getElementById('confirmDialog').style.display = 'none';
        if (_confirmCallback) _confirmCallback();
        _confirmCallback = null;
    }

    function cancelDialog() {
        document.getElementById('confirmDialog').style.display = 'none';
        _confirmCallback = null;
    }

    // 读取文件为 ArrayBuffer (5+App)
    function readFileAsBuffer(file, callback) {
        var reader = new FileReader();
        reader.onload = function(e) {
            callback(null, e.target.result);
        };
        reader.onerror = function(e) {
            callback(e, null);
        };
        reader.readAsArrayBuffer(file);
    }

    // 数字清洗
    function toNum(val) {
        if (val === null || val === undefined) return '';
        var n = Number(val);
        return isNaN(n) ? String(val).trim() : n;
    }

    // 字符串清洗
    function toStr(val) {
        if (val === null || val === undefined) return '';
        return String(val).replace(/\xa0/g, '').trim();
    }

    return {
        showToast: showToast,
        formatDate: formatDate,
        formatDateTime: formatDateTime,
        today: today,
        escapeHtml: escapeHtml,
        genId: genId,
        getFilterOptions: getFilterOptions,
        filterStations: filterStations,
        updateSelect: updateSelect,
        showConfirm: showConfirm,
        confirmAction: confirmAction,
        cancelDialog: cancelDialog,
        readFileAsBuffer: readFileAsBuffer,
        toNum: toNum,
        toStr: toStr
    };
})();

// 挂载到全局
function confirmAction() { Utils.confirmAction(); }
function cancelDialog() { Utils.cancelDialog(); }
