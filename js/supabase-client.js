/**
 * supabase-client.js - Supabase 云端数据管理
 * 实现云端同步和离线缓存
 */

var SupabaseClient = (function() {
    // Supabase 配置
    var SUPABASE_URL = 'https://lyozfvgmagykymkpvloq.supabase.co';
    var SUPABASE_KEY = 'sb_publishable_CoJszwViw0m_UAwqEMCCNA_DgMw64k2';
    
    var supabase = null;
    var isOnline = true;
    var syncQueue = [];
    var initAttempts = 0;
    var maxInitAttempts = 10;
    
    // 站点表允许的字段列表
    var allowedStationFields = [
        'id', 'type', 'name', 'county', 'town', 'village', 'hamlet',
        'station_type', 'investment', 'start_supply_date', 'location',
        'population', 'water_quality_result', 'contact_person', 'contact_phone',
        'lat', 'lng', 'created_at', 'updated_at', 'created_by', 'updated_by', 'is_deleted'
    ];
    
    // 字段名映射（驼峰转下划线）
    var fieldMapping = {
        'waterQuality': 'water_quality',
        'waterQualityProb': 'water_quality_prob',
        'waterQuantity': 'water_quantity',
        'supplyGuarantee': 'supply_guarantee',
        'waterFeeStandard': 'water_fee_standard',
        'largeLivestockFee': 'large_livestock_fee',
        'subsidyMechanism': 'subsidy_mechanism',
        'supplyMode': 'supply_mode',
        'stableSource': 'stable_source',
        'operationMaintenance': 'operation_maintenance',
        'equipmentStatus': 'equipment_status',
        'serviceInfoPosted': 'service_info_posted',
        'repairTimeLimit': 'repair_time_limit',
        'healthCertificate': 'health_certificate',
        'fundManagement': 'fund_management',
        'unifiedManagement': 'unified_management',
        'managementProb': 'management_prob',
        'problemSummary': 'problem_summary',
        'surveyDate': 'survey_date',
        'finalDate': 'final_date',
        'rectificationStatus': 'rectification_status',
        'feedbackIssued': 'feedback_issued',
        'feedbackNo': 'feedback_no',
        'rectificationCompleted': 'rectification_completed',
        'projectYear': 'project_year',
        'updateTime': 'updated_at',
        'createTime': 'created_at'
    };
    
    // 调查记录允许的字段列表
    var allowedSurveyFields = [
        'station_id', 'county', 'town', 'village', 'hamlet', 'project_name',
        'water_quality', 'water_quality_prob', 'water_quantity', 'convenience',
        'supply_guarantee', 'water_fee_standard', 'large_livestock_fee', 'subsidy_mechanism',
        'supply_mode', 'stable_source', 'operation_maintenance', 'equipment_status',
        'service_info_posted', 'repair_time_limit', 'health_certificate',
        'fund_management', 'unified_management', 'management_prob', 'households',
        'problem_summary', 'suggestions', 'survey_date', 'investigators', 'final_date',
        'rectification_status', 'feedback_issued', 'feedback_no', 'rectification_completed',
        'project_year', 'lat', 'lng', 'created_at', 'updated_at', 'created_by'
    ];
    
    // 初始化 Supabase（带重试机制）
    function init() {
        // 检查 supabase 对象（UMD版本挂载在 window.supabase）
        var supabaseLib = window.supabase;
        
        if (!supabaseLib || !supabaseLib.createClient) {
            initAttempts++;
            if (initAttempts < maxInitAttempts) {
                console.log('Supabase SDK 尚未加载，第' + initAttempts + '次重试...');
                // 延迟重试
                setTimeout(init, 500);
                return false;
            } else {
                console.warn('Supabase JS SDK 加载失败，将使用本地存储模式');
                return false;
            }
        }
        
        try {
            supabase = supabaseLib.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('Supabase 初始化成功');
            return true;
        } catch(e) {
            console.error('Supabase 初始化失败:', e);
            return false;
        }
    }
    
    // 检查在线状态
    function checkOnline() {
        return navigator.onLine && supabase !== null;
    }
    
    // ========== 站点操作 ==========
    
    // 获取所有站点
    async function getStations() {
        if (!checkOnline()) {
            // 离线模式返回本地数据
            return Storage.getCentralStations().concat(Storage.getDispersedStations());
        }
        
        try {
            var { data, error } = await supabase
                .from('stations')
                .select('*')
                .eq('is_deleted', false)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            // 合并数据：云端数据 + 本地独有的数据
            if (data && data.length > 0) {
                var localCentral = Storage.getCentralStations();
                var localDispersed = Storage.getDispersedStations();
                var localStations = localCentral.concat(localDispersed);
                
                // 找出本地有但云端没有的站点
                var cloudIds = data.map(function(s) { return s.id; });
                var localOnlyStations = localStations.filter(function(s) {
                    return cloudIds.indexOf(s.id) === -1;
                });
                
                // 合并：云端数据 + 本地独有的
                var mergedData = data.concat(localOnlyStations);
                cacheStations(mergedData);
                
                // 将本地独有的站点推送到云端
                if (localOnlyStations.length > 0) {
                    console.log('推送本地站点到云端:', localOnlyStations.length, '个');
                    localOnlyStations.forEach(function(station) {
                        addToSyncQueue('stations', station.id, 'UPSERT', station);
                    });
                }
            }
            return data || [];
        } catch(e) {
            console.error('获取站点失败:', e);
            // 返回本地缓存
            return Storage.getCentralStations().concat(Storage.getDispersedStations());
        }
    }
    
    // 保存站点（新增/更新）
    async function saveStation(station) {
        // 先保存到本地
        var localStation;
        if (station.type === 'central') {
            localStation = Storage.upsertCentral(station);
        } else {
            localStation = Storage.upsertDispersed(station);
        }
        
        if (!checkOnline()) {
            // 离线状态，添加到同步队列
            addToSyncQueue('stations', station.id, 'UPSERT', station);
            return localStation;
        }
        
        try {
            var { data, error } = await supabase
                .from('stations')
                .upsert(station, { onConflict: 'id' })
                .select()
                .single();
            
            if (error) throw error;
            return data || localStation;
        } catch(e) {
            console.error('保存站点到云端失败:', e);
            addToSyncQueue('stations', station.id, 'UPSERT', station);
            return localStation;
        }
    }
    
    // 删除站点
    async function deleteStation(id, type) {
        // 本地删除
        if (type === 'central') {
            Storage.deleteCentral(id);
        } else {
            Storage.deleteDispersed(id);
        }
        
        if (!checkOnline()) {
            addToSyncQueue('stations', id, 'DELETE', { id: id });
            return true;
        }
        
        try {
            var { error } = await supabase
                .from('stations')
                .update({ is_deleted: true })
                .eq('id', id);
            
            if (error) throw error;
            return true;
        } catch(e) {
            console.error('删除站点失败:', e);
            addToSyncQueue('stations', id, 'DELETE', { id: id });
            return true;
        }
    }
    
    // ========== 调查记录操作 ==========
    
    // 获取所有调查记录
    async function getSurveys() {
        if (!checkOnline()) {
            return Storage.getSurveys();
        }
        
        try {
            var { data, error } = await supabase
                .from('surveys')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            // 获取本地调查记录
            var localSurveys = Storage.getSurveys();
            
            // 合并数据：云端数据 + 本地独有的数据
            var surveys = {};
            if (data && data.length > 0) {
                data.forEach(function(s) {
                    surveys[s.station_id] = s;
                });
            }
            
            // 找出本地有但云端没有的调查记录
            for (var stationId in localSurveys) {
                if (!surveys[stationId]) {
                    surveys[stationId] = localSurveys[stationId];
                    // 添加到同步队列
                    addToSyncQueue('surveys', stationId, 'UPSERT', 
                        Object.assign({}, localSurveys[stationId], { station_id: stationId }));
                }
            }
            
            // 缓存合并后的数据
            Storage.set('surveys', surveys);
            return surveys;
        } catch(e) {
            console.error('获取调查记录失败:', e);
            return Storage.getSurveys();
        }
    }
    
    // 保存调查记录
    async function saveSurvey(stationId, surveyData) {
        // 本地保存
        Storage.saveSurvey(stationId, surveyData);
        
        if (!checkOnline()) {
            addToSyncQueue('surveys', stationId, 'UPSERT', Object.assign({}, surveyData, { station_id: stationId }));
            return surveyData;
        }
        
        try {
            // 转换数组字段为 PostgreSQL 数组格式
            var dataToSave = Object.assign({}, surveyData, {
                station_id: stationId,
                water_quality_prob: surveyData.waterQualityProb || [],
                management_prob: surveyData.managementProb || [],
                households: surveyData.households || []
            });
            
            var { data, error } = await supabase
                .from('surveys')
                .upsert(dataToSave, { onConflict: 'station_id' })
                .select()
                .single();
            
            if (error) throw error;
            return data || surveyData;
        } catch(e) {
            console.error('保存调查记录失败:', e);
            addToSyncQueue('surveys', stationId, 'UPSERT', Object.assign({}, surveyData, { station_id: stationId }));
            return surveyData;
        }
    }
    
    // ========== 草稿操作 ==========
    
    // 获取所有草稿
    async function getDrafts() {
        if (!checkOnline()) {
            return Storage.getDraftSurveys();
        }
        
        try {
            var { data, error } = await supabase
                .from('drafts')
                .select('*');
            
            if (error) throw error;
            
            // 获取本地草稿
            var localDrafts = Storage.getDraftSurveys();
            
            // 合并数据：云端数据 + 本地独有的数据
            var drafts = {};
            if (data && data.length > 0) {
                data.forEach(function(d) {
                    drafts[d.station_id] = Object.assign({}, d.survey_data, {
                        stationId: d.station_id,
                        draftTime: d.updated_at,
                        isDraft: true
                    });
                });
            }
            
            // 找出本地有但云端没有的草稿
            for (var stationId in localDrafts) {
                if (!drafts[stationId]) {
                    drafts[stationId] = localDrafts[stationId];
                    // 添加到同步队列
                    addToSyncQueue('drafts', stationId, 'UPSERT', {
                        station_id: stationId,
                        survey_data: localDrafts[stationId],
                        current_step: localDrafts[stationId].currentStep || 1
                    });
                }
            }
            
            // 缓存合并后的数据
            Storage.set('draft_surveys', drafts);
            return drafts;
        } catch(e) {
            console.error('获取草稿失败:', e);
            return Storage.getDraftSurveys();
        }
    }
    
    // 保存草稿
    async function saveDraft(stationId, draftData) {
        // 本地保存
        Storage.saveDraftSurvey(stationId, draftData);
        
        if (!checkOnline()) {
            addToSyncQueue('drafts', stationId, 'UPSERT', {
                station_id: stationId,
                survey_data: draftData,
                current_step: draftData.currentStep || 1
            });
            return draftData;
        }
        
        try {
            var { data, error } = await supabase
                .from('drafts')
                .upsert({
                    station_id: stationId,
                    survey_data: draftData,
                    current_step: draftData.currentStep || 1
                }, { onConflict: 'station_id' })
                .select()
                .single();
            
            if (error) throw error;
            return data || draftData;
        } catch(e) {
            console.error('保存草稿失败:', e);
            addToSyncQueue('drafts', stationId, 'UPSERT', {
                station_id: stationId,
                survey_data: draftData,
                current_step: draftData.currentStep || 1
            });
            return draftData;
        }
    }
    
    // 删除草稿
    async function deleteDraft(stationId) {
        Storage.deleteDraftSurvey(stationId);
        
        if (!checkOnline()) {
            addToSyncQueue('drafts', stationId, 'DELETE', { station_id: stationId });
            return true;
        }
        
        try {
            var { error } = await supabase
                .from('drafts')
                .delete()
                .eq('station_id', stationId);
            
            if (error) throw error;
            return true;
        } catch(e) {
            console.error('删除草稿失败:', e);
            addToSyncQueue('drafts', stationId, 'DELETE', { station_id: stationId });
            return true;
        }
    }
    
    // ========== 同步功能 ==========
    
    // 添加到同步队列
    function addToSyncQueue(table, recordId, operation, data) {
        syncQueue.push({
            table: table,
            recordId: recordId,
            operation: operation,
            data: data,
            timestamp: new Date().toISOString()
        });
        // 保存到本地
        Storage.set('sync_queue', syncQueue);
        console.log('已添加到同步队列:', table, recordId, operation);
    }
    
    // 执行同步
    async function sync() {
        if (!checkOnline()) {
            console.log('离线状态，无法同步');
            return { success: false, message: '离线状态' };
        }
        
        syncQueue = Storage.get('sync_queue') || [];
        if (syncQueue.length === 0) {
            console.log('同步队列为空');
            return { success: true, message: '无需同步' };
        }
        
        console.log('开始同步，队列长度:', syncQueue.length);
        var successCount = 0;
        var failCount = 0;
        
        for (var i = 0; i < syncQueue.length; i++) {
            var item = syncQueue[i];
            try {
                if (item.table === 'stations') {
                    if (item.operation === 'DELETE') {
                        await supabase.from('stations').update({ is_deleted: true }).eq('id', item.recordId);
                    } else {
                        // 清理站点数据
                        var cleanedData = {};
                        for (var j = 0; j < allowedStationFields.length; j++) {
                            var field = allowedStationFields[j];
                            if (item.data.hasOwnProperty(field)) {
                                cleanedData[field] = item.data[field];
                            }
                        }
                        await supabase.from('stations').upsert(cleanedData, { onConflict: 'id' });
                    }
                } else if (item.table === 'surveys') {
                    await supabase.from('surveys').upsert(item.data, { onConflict: 'station_id' });
                } else if (item.table === 'drafts') {
                    if (item.operation === 'DELETE') {
                        await supabase.from('drafts').delete().eq('station_id', item.recordId);
                    } else {
                        await supabase.from('drafts').upsert(item.data, { onConflict: 'station_id' });
                    }
                }
                successCount++;
            } catch(e) {
                console.error('同步失败:', item, e);
                failCount++;
            }
        }
        
        // 清空已成功同步的项（简化处理，实际应该更精细）
        if (successCount > 0) {
            syncQueue = [];
            Storage.set('sync_queue', syncQueue);
        }
        
        Utils.showToast('同步完成: 成功 ' + successCount + ', 失败 ' + failCount);
        return { success: true, successCount: successCount, failCount: failCount };
    }
    
    // 全量同步（双向同步：推送本地 + 拉取云端）
    async function pullFromCloud() {
        if (!checkOnline()) {
            Utils.showToast('离线状态，无法同步');
            return false;
        }
        
        Utils.showToast('正在同步数据...');
        
        try {
            // 先推送本地数据到云端
            Utils.showToast('正在推送本地数据...');
            await pushLocalToCloud();
            
            // 再拉取云端数据并合并
            Utils.showToast('正在拉取云端数据...');
            await getStations();
            await getSurveys();
            await getDrafts();
            
            Utils.showToast('数据同步完成');
            return true;
        } catch(e) {
            console.error('同步失败:', e);
            Utils.showToast('同步失败: ' + e.message);
            return false;
        }
    }
    
    // 推送本地数据到云端
    async function pushLocalToCloud() {
        var localCentral = Storage.getCentralStations();
        var localDispersed = Storage.getDispersedStations();
        var localSurveys = Storage.getSurveys();
        var localDrafts = Storage.getDraftSurveys();
        
        var pushCount = 0;
        var failCount = 0;
        var firstError = null;
        
        // 清理站点数据，只保留允许的字段
        function cleanStationData(station) {
            var cleaned = {};
            for (var i = 0; i < allowedStationFields.length; i++) {
                var field = allowedStationFields[i];
                if (station.hasOwnProperty(field)) {
                    cleaned[field] = station[field];
                }
            }
            // 如果没有created_at，添加当前时间
            if (!cleaned.created_at) {
                cleaned.created_at = new Date().toISOString();
            }
            return cleaned;
        }
        
        // 批量推送站点
        var allStations = localCentral.concat(localDispersed);
        console.log('准备推送站点:', allStations.length, '个');
        
        // 批量大小
        var batchSize = 100;
        var batches = Math.ceil(allStations.length / batchSize);
        
        for (var batchIdx = 0; batchIdx < batches; batchIdx++) {
            var start = batchIdx * batchSize;
            var end = Math.min(start + batchSize, allStations.length);
            var batch = allStations.slice(start, end);
            
            try {
                // 清理这批数据
                var cleanedBatch = batch.map(function(station) {
                    return cleanStationData(station);
                });
                
                var { data, error } = await supabase
                    .from('stations')
                    .upsert(cleanedBatch, { onConflict: 'id' });
                
                if (error) {
                    console.error('批量推送站点失败:', start, '-', end, error);
                    failCount += batch.length;
                    if (!firstError) firstError = error;
                } else {
                    pushCount += batch.length;
                    console.log('推送进度:', end, '/', allStations.length);
                }
            } catch(e) {
                console.error('批量推送站点异常:', start, '-', end, e);
                failCount += batch.length;
                if (!firstError) firstError = e;
            }
        }
        
        console.log('站点推送完成: 成功', pushCount, '失败', failCount);
        
        // 清理调查数据
        function cleanSurveyData(survey, stationId) {
            var cleaned = { station_id: stationId };
            
            for (var key in survey) {
                // 跳过 stationId 和 _type 等内部字段
                if (key === 'stationId' || key === '_type' || key === 'lat' || key === 'lng') continue;
                
                // 映射字段名
                var dbField = fieldMapping[key] || key;
                
                // 只保留允许的字段
                if (allowedSurveyFields.indexOf(dbField) >= 0) {
                    cleaned[dbField] = survey[key];
                }
            }
            
            // 如果没有created_at，添加当前时间
            if (!cleaned.created_at && survey.updateTime) {
                cleaned.created_at = survey.updateTime;
            }
            if (!cleaned.created_at) {
                cleaned.created_at = new Date().toISOString();
            }
            
            // 确保数组字段是数组
            if (!Array.isArray(cleaned.water_quality_prob)) {
                cleaned.water_quality_prob = [];
            }
            if (!Array.isArray(cleaned.management_prob)) {
                cleaned.management_prob = [];
            }
            if (!cleaned.households) {
                cleaned.households = [];
            }
            
            return cleaned;
        }
        
        // 批量推送调查记录
        var surveyList = [];
        for (var stationId in localSurveys) {
            surveyList.push({
                stationId: stationId,
                data: localSurveys[stationId]
            });
        }
        console.log('准备推送调查记录:', surveyList.length, '条');
        
        var surveyCount = 0;
        var surveyBatches = Math.ceil(surveyList.length / batchSize);
        
        for (var sBatchIdx = 0; sBatchIdx < surveyBatches; sBatchIdx++) {
            var sStart = sBatchIdx * batchSize;
            var sEnd = Math.min(sStart + batchSize, surveyList.length);
            var sBatch = surveyList.slice(sStart, sEnd);
            
            try {
                var cleanedSurveyBatch = sBatch.map(function(item) {
                    return cleanSurveyData(item.data, item.stationId);
                });
                
                var { data, error } = await supabase
                    .from('surveys')
                    .upsert(cleanedSurveyBatch, { onConflict: 'station_id' });
                
                if (error) {
                    console.error('批量推送调查记录失败:', sStart, '-', sEnd, error);
                } else {
                    surveyCount += sBatch.length;
                }
            } catch(e) {
                console.error('批量推送调查记录异常:', sStart, '-', sEnd, e);
            }
        }
        console.log('调查记录推送完成:', surveyCount, '条');
        
        // 批量推送草稿
        var draftList = [];
        for (var draftId in localDrafts) {
            draftList.push({
                draftId: draftId,
                data: localDrafts[draftId]
            });
        }
        console.log('准备推送草稿:', draftList.length, '条');
        
        var draftCount = 0;
        var draftBatches = Math.ceil(draftList.length / batchSize);
        
        for (var dBatchIdx = 0; dBatchIdx < draftBatches; dBatchIdx++) {
            var dStart = dBatchIdx * batchSize;
            var dEnd = Math.min(dStart + batchSize, draftList.length);
            var dBatch = draftList.slice(dStart, dEnd);
            
            try {
                var cleanedDraftBatch = dBatch.map(function(item) {
                    var cleanedDraftData = cleanSurveyData(item.data, item.draftId);
                    return {
                        station_id: item.draftId,
                        survey_data: cleanedDraftData,
                        current_step: item.data.currentStep || 1
                    };
                });
                
                var { data, error } = await supabase
                    .from('drafts')
                    .upsert(cleanedDraftBatch, { onConflict: 'station_id' });
                
                if (error) {
                    console.error('批量推送草稿失败:', dStart, '-', dEnd, error);
                } else {
                    draftCount += dBatch.length;
                }
            } catch(e) {
                console.error('批量推送草稿异常:', dStart, '-', dEnd, e);
            }
        }
        console.log('草稿推送完成:', draftCount, '条');
        
        var totalPushed = pushCount + surveyCount + draftCount;
        console.log('推送本地数据完成: 站点', pushCount, '调查', surveyCount, '草稿', draftCount);
        
        // 如果有错误，显示给用户
        if (firstError) {
            Utils.showToast('推送出错: ' + (firstError.message || firstError.code || '未知错误'));
        }
        
        return totalPushed;
    }
    
    // ========== 本地缓存 ==========
    
    // 缓存站点数据
    function cacheStations(stations) {
        var central = [];
        var dispersed = [];
        
        stations.forEach(function(s) {
            if (s.type === 'central') {
                central.push(s);
            } else {
                dispersed.push(s);
            }
        });
        
        Storage.saveCentralStations(central);
        Storage.saveDispersedStations(dispersed);
    }
    
    // 监听网络状态
    window.addEventListener('online', function() {
        console.log('网络已连接');
        isOnline = true;
        // 自动同步
        sync();
    });
    
    window.addEventListener('offline', function() {
        console.log('网络已断开');
        isOnline = false;
    });
    
    // 初始化
    init();
    
    // 返回公共接口
    return {
        // 站点
        getStations: getStations,
        saveStation: saveStation,
        deleteStation: deleteStation,
        
        // 调查记录
        getSurveys: getSurveys,
        saveSurvey: saveSurvey,
        
        // 草稿
        getDrafts: getDrafts,
        saveDraft: saveDraft,
        deleteDraft: deleteDraft,
        
        // 同步
        sync: sync,
        pullFromCloud: pullFromCloud,
        checkOnline: checkOnline
    };
})();
