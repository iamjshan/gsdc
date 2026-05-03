/**
 * analyze-duplicates.js - 分析云端数据重复情况
 */

// 在浏览器控制台执行此脚本来分析重复

async function analyzeCloudDuplicates() {
    console.log('正在分析云端数据...');
    
    // 获取 Supabase 客户端实例
    var supabaseClient = window.SupabaseClient;
    if (!supabaseClient) {
        console.error('SupabaseClient 未初始化');
        alert('请先等待页面加载完成');
        return;
    }
    
    Utils.showToast('正在获取云端数据...');
    
    // 获取 supabase 实例（通过 SupabaseClient 的内部接口）
    var supabase = supabaseClient._supabase;
    if (!supabase) {
        console.error('无法获取 supabase 实例');
        alert('无法访问 Supabase 客户端，请稍后重试');
        return;
    }
    
    // 获取所有站点
    var allData = [];
    var page = 0;
    var pageSize = 1000;
    var hasMore = true;
    
    while (hasMore) {
        try {
            var response = await supabase
                .from('stations')
                .select('*')
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);
            
            var data = response.data;
            var error = response.error;
            
            if (error) {
                console.error('获取失败:', error);
                Utils.showToast('获取数据失败: ' + error.message);
                return;
            }
            
            if (data && data.length > 0) {
                allData = allData.concat(data);
                console.log('获取第 ' + (page + 1) + ' 页: ' + data.length + ' 条，累计: ' + allData.length);
                Utils.showToast('已获取 ' + allData.length + ' 条数据...');
                
                if (data.length < pageSize) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                hasMore = false;
            }
        } catch(e) {
            console.error('获取数据异常:', e);
            Utils.showToast('获取数据异常: ' + e.message);
            return;
        }
    }
    
    console.log('=== 数据分析 ===');
    console.log('总记录数:', allData.length);
    
    // 1. 按ID统计重复
    var idGroups = {};
    allData.forEach(function(s) {
        if (!idGroups[s.id]) idGroups[s.id] = [];
        idGroups[s.id].push(s);
    });
    
    var duplicateIds = Object.keys(idGroups).filter(function(id) {
        return idGroups[id].length > 1;
    });
    console.log('有重复的ID数:', duplicateIds.length);
    
    var idDuplicateCount = duplicateIds.reduce(function(sum, id) {
        return sum + idGroups[id].length;
    }, 0);
    console.log('这些ID的重复记录数:', idDuplicateCount);
    
    // 显示前10个重复ID
    if (duplicateIds.length > 0) {
        console.log('\n前10个重复ID:');
        duplicateIds.slice(0, 10).forEach(function(id) {
            var stations = idGroups[id];
            console.log('\n' + id + ' (' + stations.length + '条):');
            stations.forEach(function(s) {
                console.log('  - 创建时间: ' + s.created_at);
                console.log('    更新时间: ' + s.updated_at);
            });
        });
    }
    
    // 2. 按站点名称统计（可能是同一站点不同ID）
    var nameGroups = {};
    allData.forEach(function(s) {
        var name = s.name || '';
        if (name) {
            if (!nameGroups[name]) nameGroups[name] = [];
            nameGroups[name].push(s);
        }
    });
    
    var duplicateNames = Object.keys(nameGroups).filter(function(name) {
        return nameGroups[name].length > 1;
    });
    console.log('\n=== 按名称统计重复 ===');
    console.log('有重复名称的站点数:', duplicateNames.length);
    
    // 显示前10个重复名称
    if (duplicateNames.length > 0) {
        console.log('\n前10个重复名称:');
        duplicateNames.slice(0, 10).forEach(function(name) {
            var stations = nameGroups[name];
            console.log('\n' + name + ' (' + stations.length + '条):');
            stations.forEach(function(s) {
                console.log('  - ID: ' + s.id);
                console.log('    创建时间: ' + s.created_at);
            });
        });
    }
    
    // 3. 分析ID模式
    console.log('\n=== ID模式分析 ===');
    var idPatterns = {};
    allData.forEach(function(s) {
        var id = s.id || '';
        // 提取前缀（去掉时间戳部分）
        var match = id.match(/^(.+)-\d+$/);
        if (match) {
            var prefix = match[1];
            if (!idPatterns[prefix]) idPatterns[prefix] = 0;
            idPatterns[prefix]++;
        }
    });
    
    // 找出有重复前缀的
    var duplicatePrefixes = Object.keys(idPatterns).filter(function(p) {
        return idPatterns[p] > 1;
    });
    console.log('有重复前缀的站点数:', duplicatePrefixes.length);
    
    if (duplicatePrefixes.length > 0) {
        console.log('\n前10个重复前缀:');
        duplicatePrefixes.slice(0, 10).forEach(function(prefix) {
            var count = idPatterns[prefix];
            console.log(prefix + ' (' + count + '条)');
        });
    }
    
    // 显示分析结果总结
    var summary = '分析完成!\n' +
        '总记录数: ' + allData.length + '\n' +
        'ID重复: ' + duplicateIds.length + ' 个ID (' + idDuplicateCount + ' 条记录)\n' +
        '名称重复: ' + duplicateNames.length + ' 个站点\n' +
        '前缀重复: ' + duplicatePrefixes.length + ' 个前缀';
    
    console.log('\n=== 总结 ===');
    console.log(summary);
    
    Utils.showToast('分析完成！请在控制台查看详细结果');
    alert(summary);
    
    return {
        total: allData.length,
        duplicateIds: duplicateIds.length,
        idDuplicateRecords: idDuplicateCount,
        duplicateNames: duplicateNames.length,
        duplicatePrefixes: duplicatePrefixes.length
    };
}

// 挂载到全局
window.analyzeCloudDuplicates = analyzeCloudDuplicates;
console.log('分析工具已加载，点击"📊 分析重复"按钮或执行 analyzeCloudDuplicates() 开始分析');
