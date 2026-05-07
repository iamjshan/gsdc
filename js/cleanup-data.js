/**
 * cleanup-data.js - 数据清理工具
 * 用于清理本地重复数据和重置应用
 */

var DataCleanup = (function() {
    
    // 清理本地所有数据
    function clearAllLocalData() {
        try {
            // 列出所有要清理的 localStorage 键
            var keysToRemove = [
                'central_stations',
                'dispersed_stations',
                'surveys',
                'draft_surveys',
                'sync_queue',
                'recent_records'
            ];
            
            var removedCount = 0;
            keysToRemove.forEach(function(key) {
                if (localStorage.getItem(key) !== null) {
                    localStorage.removeItem(key);
                    removedCount++;
                    console.log('已删除:', key);
                }
            });
            
            console.log('清理完成，共删除 ' + removedCount + ' 项数据');
            return { success: true, removed: removedCount };
        } catch(e) {
            console.error('清理数据失败:', e);
            return { success: false, error: e.message };
        }
    }
    
    // 清理本地重复站点
    function deduplicateLocalStations() {
        try {
            var central = JSON.parse(localStorage.getItem('central_stations') || '[]');
            var dispersed = JSON.parse(localStorage.getItem('dispersed_stations') || '[]');
            
            console.log('清理前 - 集中式:', central.length, '分散式:', dispersed.length);
            
            // 按 ID 去重
            var centralMap = {};
            central.forEach(function(s) {
                if (s.id) {
                    // 保留最新的
                    if (!centralMap[s.id] || (s.updated_at && centralMap[s.id].updated_at < s.updated_at)) {
                        centralMap[s.id] = s;
                    }
                }
            });
            
            var dispersedMap = {};
            dispersed.forEach(function(s) {
                if (s.id) {
                    if (!dispersedMap[s.id] || (s.updated_at && dispersedMap[s.id].updated_at < s.updated_at)) {
                        dispersedMap[s.id] = s;
                    }
                }
            });
            
            var newCentral = Object.values(centralMap);
            var newDispersed = Object.values(dispersedMap);
            
            console.log('清理后 - 集中式:', newCentral.length, '分散式:', newDispersed.length);
            
            // 保存回去
            localStorage.setItem('central_stations', JSON.stringify(newCentral));
            localStorage.setItem('dispersed_stations', JSON.stringify(newDispersed));
            
            return {
                success: true,
                centralBefore: central.length,
                centralAfter: newCentral.length,
                dispersedBefore: dispersed.length,
                dispersedAfter: newDispersed.length
            };
        } catch(e) {
            console.error('去重失败:', e);
            return { success: false, error: e.message };
        }
    }
    
    // 查看本地数据统计
    function getLocalDataStats() {
        try {
            var central = JSON.parse(localStorage.getItem('central_stations') || '[]');
            var dispersed = JSON.parse(localStorage.getItem('dispersed_stations') || '[]');
            var surveys = JSON.parse(localStorage.getItem('surveys') || '{}');
            var queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
            
            return {
                centralStations: central.length,
                dispersedStations: dispersed.length,
                totalStations: central.length + dispersed.length,
                surveys: Object.keys(surveys).length,
                syncQueue: queue.length
            };
        } catch(e) {
            console.error('获取统计失败:', e);
            return { error: e.message };
        }
    }
    
    // 重置应用（清理所有数据并刷新）
    function resetApp() {
        if (!confirm('确定要清空所有本地数据吗？此操作不可恢复！')) {
            return;
        }
        
        var result = clearAllLocalData();
        if (result.success) {
            alert('数据已清空，点击确定刷新页面');
            window.location.reload();
        } else {
            alert('清空失败: ' + result.error);
        }
    }
    
    return {
        clearAllLocalData: clearAllLocalData,
        deduplicateLocalStations: deduplicateLocalStations,
        getLocalDataStats: getLocalDataStats,
        resetApp: resetApp
    };
})();

// 挂载到全局
window.DataCleanup = DataCleanup;
console.log('数据清理工具已加载，可用命令：');
console.log('DataCleanup.getLocalDataStats() - 查看数据统计');
console.log('DataCleanup.deduplicateLocalStations() - 清理重复站点');
console.log('DataCleanup.clearAllLocalData() - 清空所有数据');
console.log('DataCleanup.resetApp() - 重置应用');
