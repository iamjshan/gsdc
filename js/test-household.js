// 测试 householdDetails 数据流
var TestHousehold = (function() {
    
    function testSaveAndLoad() {
        var stationId = 'test-station-001';
        
        // 准备测试数据
        var testSurvey = {
            stationId: stationId,
            surveyDate: '2025-01-01',
            county: '测试县',
            town: '测试乡',
            village: '测试村',
            householdDetails: [
                {name: '张三', selection: ['满意'], reason: '水质好'},
                {name: '李四', selection: ['不满意', '脱贫人口'], reason: '水压低'},
                {name: '王五', selection: [], reason: ''}
            ],
            managementProb: ['未设置围栏', '未设置明白卡'],
            photos: []
        };
        
        console.log('===== 测试开始 =====');
        console.log('1. 原始测试数据 householdDetails:', JSON.stringify(testSurvey.householdDetails));
        
        // 本地保存
        Storage.saveSurvey(stationId, testSurvey);
        console.log('2. 本地保存完成');
        
        // 从本地读取
        var loaded = Storage.getSurvey(stationId);
        console.log('3. 本地读取 householdDetails:', JSON.stringify(loaded ? loaded.householdDetails : 'null'));
        
        // 如果 SupabaseClient 可用，测试云端同步
        if (typeof SupabaseClient !== 'undefined') {
            console.log('4. 准备同步到云端...');
            SupabaseClient.saveSurvey(stationId, testSurvey).then(function(result) {
                console.log('5. 云端保存完成，返回数据 household_details:', 
                    JSON.stringify(result ? result.household_details : 'null'));
                
                // 重新获取所有调查
                console.log('6. 重新获取调查记录...');
                return SupabaseClient.getSurveys();
            }).then(function(surveys) {
                var s = surveys[stationId];
                console.log('7. 重新获取后 householdDetails:', 
                    JSON.stringify(s ? s.householdDetails : 'null'));
                console.log('===== 测试完成 =====');
                
                // 清理测试数据
                Storage.deleteSurvey(stationId);
                alert('测试完成，请查看控制台输出');
            }).catch(function(err) {
                console.error('测试出错:', err);
                alert('测试出错: ' + err.message);
            });
        } else {
            console.log('4. SupabaseClient 不可用，跳过云端测试');
            console.log('===== 测试完成 =====');
            alert('本地测试完成，请查看控制台输出');
        }
    }
    
    // 直接测试 transform 函数
    function testTransform() {
        console.log('===== 测试数据转换 =====');
        
        var testData = {
            householdDetails: [
                {name: '张三', selection: ['满意'], reason: '水质好'}
            ],
            managementProb: ['问题1', '问题2']
        };
        
        console.log('原始数据:', JSON.stringify(testData));
        
        // 手动执行 transformSurveyData 的关键部分
        var transformedHouseholdDetails = [];
        if (testData.householdDetails && Array.isArray(testData.householdDetails)) {
            transformedHouseholdDetails = testData.householdDetails.map(function(h) {
                var selection = h.selection;
                if (!Array.isArray(selection)) {
                    selection = selection ? [selection] : [];
                }
                return {
                    name: h.name || '',
                    selection: selection,
                    reason: h.reason || ''
                };
            });
        }
        
        console.log('转换后 household_details:', JSON.stringify(transformedHouseholdDetails));
        console.log('===== 转换测试完成 =====');
    }
    
    return {
        testSaveAndLoad: testSaveAndLoad,
        testTransform: testTransform
    };
})();

// 暴露到全局
window.TestHousehold = TestHousehold;
console.log('TestHousehold 已加载，调用 TestHousehold.testSaveAndLoad() 进行测试');
