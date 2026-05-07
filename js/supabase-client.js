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
        'supplyTimesPerDay': 'supply_times_per_day',
        'supplyHoursPerTime': 'supply_hours_per_time',
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
    
    // 调查记录允许的字段列表（用于推送时的数据清理）
    var allowedSurveyFields = [
        'station_id', 'county', 'town', 'village', 'hamlet', 'project_name',
        'water_quality', 'water_quality_prob', 'water_quantity', 'convenience',
        'supply_guarantee', 'water_fee_standard', 'large_livestock_fee', 'subsidy_mechanism',
        'supply_mode', 'supply_times_per_day', 'supply_hours_per_time',
        'stable_source', 'operation_maintenance', 'equipment_status',
        'service_info_posted', 'repair_time_limit', 'health_certificate',
        'fund_management', 'unified_management', 'management_prob', 'households',
        'problem_summary', 'suggestions', 'survey_date', 'investigators', 'final_date',
        'rectification_status', 'feedback_issued', 'feedback_no', 'rectification_completed',
        'project_year', 'lat', 'lng', 'created_at', 'updated_at', 'created_by',
        'photos'  // 照片数组 - 重要！
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
    
    // 获取所有站点（支持分页）
    async function getStations() {
        if (!checkOnline()) {
            // 离线模式返回本地数据
            return Storage.getCentralStations().concat(Storage.getDispersedStations());
        }
        
        try {
            // 分页获取所有数据
            var allData = [];
            var pageSize = 1000;
            var page = 0;
            var hasMore = true;
            
            while (hasMore) {
                var { data, error } = await supabase
                    .from('stations')
                    .select('*')
                    .eq('is_deleted', false)
                    .order('created_at', { ascending: false })
                    .range(page * pageSize, (page + 1) * pageSize - 1);
                
                if (error) throw error;
                
                if (data && data.length > 0) {
                    allData = allData.concat(data);
                    console.log(`获取站点第 ${page + 1} 页: ${data.length} 条，累计: ${allData.length}`);
                    
                    // 如果返回的数据少于 pageSize，说明没有更多了
                    if (data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    hasMore = false;
                }
            }
            
            console.log('站点获取完成，总共:', allData.length, '条');
            
            // 对云端数据按 ID 去重
            var cloudIdMap = {};
            allData.forEach(function(s) {
                if (s.id) {
                    cloudIdMap[s.id] = s;
                }
            });
            var uniqueCloudData = Object.values(cloudIdMap);
            console.log('云端数据去重后:', uniqueCloudData.length, '条');
            
            // 保存原始数量和去重后的数量，供外部使用
            uniqueCloudData._originalCount = allData.length;
            uniqueCloudData._uniqueCount = uniqueCloudData.length;
            
            // 合并数据：云端数据 + 本地独有的数据
            if (uniqueCloudData.length > 0) {
                var localCentral = Storage.getCentralStations();
                var localDispersed = Storage.getDispersedStations();
                var localStations = localCentral.concat(localDispersed);
                
                // 找出本地有但云端没有的站点
                var cloudIdSet = {};
                uniqueCloudData.forEach(function(s) { cloudIdSet[s.id] = true; });
                var localOnlyStations = localStations.filter(function(s) {
                    return !cloudIdSet[s.id];
                });
                
                // 合并：云端数据 + 本地独有的
                var mergedData = uniqueCloudData.concat(localOnlyStations);
                cacheStations(mergedData);
                
                // 将本地独有的站点推送到云端
                if (localOnlyStations.length > 0) {
                    console.log('推送本地站点到云端:', localOnlyStations.length, '个');
                    localOnlyStations.forEach(function(station) {
                        addToSyncQueue('stations', station.id, 'UPSERT', station);
                    });
                }
                
                return mergedData;
            }
            return allData || [];
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
            console.log('离线状态，返回本地调查记录');
            return Storage.getSurveys();
        }
        
        try {
            console.log('=== 开始拉取调查记录 ===');
            
            // 先查询云端有多少条记录
            var { count, error: countError } = await supabase
                .from('surveys')
                .select('*', { count: 'exact', head: true });
            console.log('云端调查记录总数:', count, '错误:', countError);
            
            console.log('开始查询调查表...');
            var { data, error } = await supabase
                .from('surveys')
                .select('*')
                .order('created_at', { ascending: false });
            
            console.log('调查表查询结果:', '数据条数:', data ? data.length : 0, '错误:', error);
            
            if (error) {
                console.error('查询调查表失败:', error);
                throw error;
            }
            
            console.log('从云端拉取到调查记录:', data ? data.length : 0, '条');
            if (data && data.length > 0) {
                console.log('云端调查记录ID列表:', data.map(function(s) { return s.station_id; }).join(', '));
                console.log('第一条调查记录:', data[0].station_id, '照片数:', (data[0].photos || []).length);
            }
            
            // 获取本地调查记录
            var localSurveys = Storage.getSurveys();
            console.log('本地已有调查记录:', Object.keys(localSurveys).length, '条');
            console.log('本地调查记录ID列表:', Object.keys(localSurveys).join(', '));
            
            // 合并数据：云端数据优先（覆盖本地）
            var surveys = Object.assign({}, localSurveys); // 先复制本地数据
            console.log('本地调查记录初始:', Object.keys(surveys).length, '条');
            
            // 获取本地草稿记录
            var localDrafts = Storage.getDraftSurveys ? Storage.getDraftSurveys() : {};
            console.log('本地草稿记录:', Object.keys(localDrafts).length, '条');
            
            if (data && data.length > 0) {
                console.log('开始合并', data.length, '条云端调查记录...');
                data.forEach(function(s) {
                    if (!s.station_id) {
                        console.error('云端调查记录缺少 station_id:', s);
                        return;
                    }
                    console.log('处理云端调查:', s.station_id);
                    
                    // 如果本地有进行中的草稿，优先保留草稿（不覆盖为云端已完成）
                    if (localDrafts[s.station_id]) {
                        console.log('  本地有进行中的草稿，跳过云端已完成数据');
                        return;
                    }
                    
                    console.log('  云端原始 supply_times_per_day:', s.supply_times_per_day);
                    console.log('  云端原始 supply_hours_per_time:', s.supply_hours_per_time);
                    // 云端数据转换回本地格式
                    var localFormatData = transformCloudToLocal(s);
                    // 云端数据覆盖本地
                    surveys[s.station_id] = localFormatData;
                    console.log('  转换后 supplyTimesPerDay:', localFormatData.supplyTimesPerDay);
                    console.log('  转换后 supplyHoursPerTime:', localFormatData.supplyHoursPerTime);
                    console.log('  照片数:', (localFormatData.photos || []).length);
                });
                console.log('合并完成，总计:', Object.keys(surveys).length, '条');
            } else {
                console.log('云端没有调查记录');
            }
            
            // 找出本地有但云端没有的调查记录，添加到同步队列
            for (var stationId in localSurveys) {
                if (!data || !data.find(function(d) { return d.station_id === stationId; })) {
                    // 本地独有的，添加到队列稍后推送
                    var dataToSave = transformSurveyData(localSurveys[stationId], stationId);
                    addToSyncQueue('surveys', stationId, 'UPSERT', dataToSave);
                    console.log('本地调查待推送:', stationId);
                }
            }
            
            // 分批缓存调查数据，避免超出存储限制
            var surveyKeys = Object.keys(surveys);
            console.log('准备保存调查记录:', surveyKeys.length, '条', '键列表:', surveyKeys.join(','));
            
            if (surveyKeys.length === 0) {
                console.log('没有调查记录需要保存');
                return surveys;
            }
            
            // 检查是否有照片数据
            var hasPhotos = false;
            for (var sid in surveys) {
                if (surveys[sid].photos && surveys[sid].photos.length > 0) {
                    hasPhotos = true;
                    break;
                }
            }
            console.log('调查记录包含照片:', hasPhotos);
            
            // 优先使用 IndexedDB 保存（容量更大，支持照片）
            if (typeof IndexedDBStorage !== 'undefined' && IndexedDBStorage.isAvailable()) {
                console.log('使用 IndexedDB 保存调查记录（包含照片）...');
                console.log('IndexedDB 是否可用:', IndexedDBStorage.isAvailable());
                try {
                    await IndexedDBStorage.init();
                    console.log('IndexedDB 初始化成功，开始保存调查记录...');
                    
                    // 检查是否有照片需要保存
                    var surveyWithPhotos = 0;
                    for (var sid in surveys) {
                        if (surveys[sid].photos && surveys[sid].photos.length > 0) {
                            surveyWithPhotos++;
                            console.log('调查记录 ' + sid + ' 包含 ' + surveys[sid].photos.length + ' 张照片');
                        }
                    }
                    console.log('共有 ' + surveyWithPhotos + ' 条调查记录包含照片');
                    
                    await IndexedDBStorage.saveSurveys(surveys);
                    console.log('调查记录（含照片）已保存到 IndexedDB:', surveyKeys.length, '条');
                    
                    // 验证保存结果
                    var verifySurveys = await IndexedDBStorage.getAllSurveys();
                    console.log('验证 IndexedDB 中的调查记录:', Object.keys(verifySurveys).length, '条');
                    var verifyPhotos = 0;
                    for (var vid in verifySurveys) {
                        if (verifySurveys[vid].photos && verifySurveys[vid].photos.length > 0) {
                            verifyPhotos += verifySurveys[vid].photos.length;
                        }
                    }
                    console.log('验证 IndexedDB 中的照片总数:', verifyPhotos, '张');
                    
                    // 同时在 LocalStorage 保存一份不含照片的备份
                    var noPhotoSurveys = {};
                    for (var sid in surveys) {
                        noPhotoSurveys[sid] = Object.assign({}, surveys[sid]);
                        if (noPhotoSurveys[sid].photos) {
                            delete noPhotoSurveys[sid].photos;
                        }
                    }
                    Storage.set('surveys', noPhotoSurveys);
                    console.log('调查记录备份（不含照片）已保存到 LocalStorage');
                    // 调试：检查第一条记录的 supply 字段
                    var firstSid = surveyKeys[0];
                    console.log('LocalStorage 保存的调查记录示例:', firstSid);
                    console.log('  supplyTimesPerDay:', noPhotoSurveys[firstSid] ? noPhotoSurveys[firstSid].supplyTimesPerDay : 'N/A');
                    console.log('  supplyHoursPerTime:', noPhotoSurveys[firstSid] ? noPhotoSurveys[firstSid].supplyHoursPerTime : 'N/A');
                    console.log('  investigator:', noPhotoSurveys[firstSid] ? noPhotoSurveys[firstSid].investigator : 'N/A');
                    
                    Utils.showToast('调查记录已同步（照片保存在 IndexedDB）');
                } catch(dbError) {
                    console.error('IndexedDB 保存失败，回退到 LocalStorage:', dbError);
                    console.error('错误详情:', dbError.stack || dbError.message);
                    // 回退到 LocalStorage
                    var saveResult = Storage.set('surveys', surveys);
                    if (saveResult) {
                        console.log('调查记录已保存到 LocalStorage:', surveyKeys.length, '条');
                    } else {
                        console.error('LocalStorage 保存也失败');
                        Utils.showToast('调查记录保存失败');
                    }
                }
            } else {
                // 没有 IndexedDB，使用 LocalStorage
                console.log('IndexedDB 不可用，使用 LocalStorage 保存...');
                if (surveyKeys.length > 50) {
                    console.log('调查记录较多，分批保存...');
                    var batchSurveys = {};
                    surveyKeys.slice(0, 50).forEach(function(key) {
                        batchSurveys[key] = surveys[key];
                    });
                    Storage.set('surveys', batchSurveys);
                    Utils.showToast('仅保存最近50条调查记录');
                } else {
                    var saveResult = Storage.set('surveys', surveys);
                    if (saveResult) {
                        console.log('调查记录保存成功:', surveyKeys.length, '条');
                    } else {
                        console.error('调查记录保存失败');
                        Utils.showToast('调查记录保存失败');
                    }
                }
            }
            
            // 验证保存的数据
            var savedSurveys = Storage.getSurveys();
            var savedCount = Object.keys(savedSurveys).length;
            console.log('验证保存的调查记录:', savedCount, '条');
            if (savedCount > 0) {
                console.log('已保存的调查ID:', Object.keys(savedSurveys).join(','));
            }
            
            return surveys;
        } catch(e) {
            console.error('获取调查记录失败:', e);
            return Storage.getSurveys();
        }
    }
    
    // 调查表允许的字段列表（数据库中存在的字段）
    var allowedSurveyFields = [
        'station_id', 'created_at', 'updated_at',
        'water_quality', 'water_quantity', 'supply_guarantee', 'convenience',
        'water_quality_prob', 'management_prob', 'households', 'household_selections', 'household_details',
        'lat', 'lng', 'survey_time', 'surveyor', 'remarks',
        'photos',  // 照片URL数组
        'survey_date', 'county', 'town', 'village', 'hamlet', 'project_name',
        'stable_source', 'project_status', 'convenience_desc', 'supply_mode',
        'supply_times_per_day', 'supply_hours_per_time',  // 定时供水频次
        // 第4步字段
        'pollution_source', 'repair_timeliness',
        // 第5步字段
        'fee_collected', 'fee_per_ton', 'fee_per_household', 'fee_per_person', 'fee_bearer',
        'livestock_fee', 'livestock_fee_amount', 'subsidy_mechanism', 'county_management', 'problem_type',
        'investigators', 'problem_summary',
        // 布尔字段
        'service_info_posted', 'health_certificate', 'fund_management', 
        'unified_management', 'quality_report', 'treatment_equip', 
        'disinfect_equip', 'repair_info', 'manager_health_cert'
    ];
    
    // 本地到云端字段映射
    var surveyFieldMapping = {
        'waterQuality': 'water_quality',
        'waterQuantity': 'water_quantity',
        'supplyGuarantee': 'supply_guarantee',
        'convenience': 'convenience',
        'waterQualityProb': 'water_quality_prob',
        'managementProb': 'management_prob',
        'updateTime': 'updated_at',
        'lat': 'lat',
        'lng': 'lng',
        'surveyTime': 'survey_time',
        'surveyor': 'surveyor',
        'remarks': 'remarks',
        'photos': 'photos',
        'surveyDate': 'survey_date',
        'county': 'county',
        'town': 'town',
        'village': 'village',
        'hamlet': 'hamlet',
        'projectName': 'project_name',
        'stableSource': 'stable_source',
        'projectStatus': 'project_status',
        'convenienceDesc': 'convenience_desc',
        'supplyMode': 'supply_mode',
        'supplyTimesPerDay': 'supply_times_per_day',
        'supplyHoursPerTime': 'supply_hours_per_time',
        'investigator': 'investigators',
        'problemSummary': 'problem_summary',
        // 第4步字段
        'pollutionSource': 'pollution_source',
        'repairTimeliness': 'repair_timeliness',
        // 第5步字段
        'feeCollected': 'fee_collected',
        'feePerTon': 'fee_per_ton',
        'feePerHousehold': 'fee_per_household',
        'feePerPerson': 'fee_per_person',
        'feeBearer': 'fee_bearer',
        'livestockFee': 'livestock_fee',
        'livestockFeeAmount': 'livestock_fee_amount',
        'subsidyMechanism': 'subsidy_mechanism',
        'countyManagement': 'county_management',
        'problemType': 'problem_type',
        // 简化版农户满意度
        'householdSelections': 'household_selections',
        'householdDetails': 'household_details',
        // 布尔字段
        'serviceInfoPosted': 'service_info_posted',
        'healthCertificate': 'health_certificate',
        'fundManagement': 'fund_management',
        'unifiedManagement': 'unified_management',
        'qualityReport': 'quality_report',
        'treatmentEquip': 'treatment_equip',
        'disinfectEquip': 'disinfect_equip',
        'repairInfo': 'repair_info',
        'managerHealthCert': 'manager_health_cert'
    };
    
    // 转换调查数据格式（本地字段名 -> 云端字段名）
    function transformSurveyData(surveyData, stationId) {
        // 转换 households 数组中的 isPoor 字段
        var transformedHouseholds = [];
        if (surveyData.households && Array.isArray(surveyData.households)) {
            transformedHouseholds = surveyData.households.map(function(h) {
                var isPoorVal = h.isPoor;
                // 将字符串转换为布尔值
                if (isPoorVal === '脱贫人口') {
                    isPoorVal = true;
                } else if (isPoorVal === '非脱贫人口') {
                    isPoorVal = false;
                } else if (typeof isPoorVal === 'boolean') {
                    isPoorVal = isPoorVal;
                } else {
                    isPoorVal = null;
                }
                return {
                    name: h.name || '',
                    isPoor: isPoorVal,
                    satisfied: h.satisfied || '',
                    suggestion: h.suggestion || ''
                };
            });
        }
        
        // 转换 householdDetails，确保 selection 是数组
        var transformedHouseholdDetails = [];
        if (surveyData.householdDetails && Array.isArray(surveyData.householdDetails)) {
            transformedHouseholdDetails = surveyData.householdDetails.map(function(h) {
                var selection = h.selection;
                // 确保 selection 是数组
                if (!Array.isArray(selection)) {
                    selection = selection ? [selection] : [];
                }
                return {
                    name: h.name || '',
                    selection: selection,  // 数组形式：['满意', '脱贫人口'] 等
                    reason: h.reason || ''
                };
            });
        }
        
        // 只保留允许的字段
        var dataToSave = {
            station_id: stationId,
            water_quality_prob: surveyData.waterQualityProb || [],
            management_prob: surveyData.managementProb || [],
            households: transformedHouseholds,
            household_selections: surveyData.householdSelections || [],
            household_details: transformedHouseholdDetails,
            photos: surveyData.photos || []
        };
        
        // 映射其他字段
        for (var localField in surveyFieldMapping) {
            var cloudField = surveyFieldMapping[localField];
            if (localField === 'householdDetails' || localField === 'householdSelections') continue;
            if (surveyData.hasOwnProperty(localField) && surveyData[localField] !== undefined && allowedSurveyFields.indexOf(cloudField) >= 0) {
                dataToSave[cloudField] = surveyData[localField];
            }
        }
        
        // 添加时间戳
        if (!dataToSave.created_at) {
            dataToSave.created_at = new Date().toISOString();
        }
        dataToSave.updated_at = new Date().toISOString();
        
        // 转换布尔字段
        var booleanFields = ['stable_source', 'service_info_posted', 'health_certificate', 
                             'fund_management', 'unified_management', 'quality_report',
                             'treatment_equip', 'disinfect_equip', 'repair_info', 'manager_health_cert'];
        booleanFields.forEach(function(field) {
            if (dataToSave[field] === '是' || dataToSave[field] === '有') dataToSave[field] = true;
            else if (dataToSave[field] === '否' || dataToSave[field] === '无') dataToSave[field] = false;
        });
        
        // 转换数值字段
        var numericFields = ['fee_per_ton', 'fee_per_household', 'fee_per_person', 'livestock_fee_amount', 
                             'supply_times_per_day', 'supply_hours_per_time'];
        numericFields.forEach(function(field) {
            if (dataToSave[field] === '' || dataToSave[field] === undefined) {
                dataToSave[field] = null;
            } else if (dataToSave[field] !== null) {
                var num = Number(dataToSave[field]);
                dataToSave[field] = isNaN(num) ? null : num;
            }
        });
        
        // 简单日志
        console.log('上传数据:', 'supply_times_per_day=' + dataToSave.supply_times_per_day, 'supply_hours_per_time=' + dataToSave.supply_hours_per_time);
        
        return dataToSave;
    }
    
    // 反向转换（云端字段名 -> 本地字段名）
    function transformCloudToLocal(cloudData) {
        var localData = {};
        
        console.log('transformCloudToLocal 开始，原始 household_details:', JSON.stringify(cloudData.household_details));
        
        // 复制所有字段（云端字段名 -> 本地字段名）
        for (var key in cloudData) {
            localData[key] = cloudData[key];
        }
        
        // 特殊处理 station_id -> stationId
        if (cloudData.station_id) {
            localData.stationId = cloudData.station_id;
        }
        
        // 特殊处理 household_details -> householdDetails
        if (cloudData.household_details !== undefined && cloudData.household_details !== null && Array.isArray(cloudData.household_details)) {
            localData.householdDetails = cloudData.household_details.map(function(h) {
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
        } else {
            localData.householdDetails = [];
        }
        
        // 反向映射其他字段
        for (var localField in surveyFieldMapping) {
            var cloudField = surveyFieldMapping[localField];
            if (cloudData.hasOwnProperty(cloudField) && cloudData[cloudField] !== undefined && cloudData[cloudField] !== null && localField !== 'householdDetails') {
                localData[localField] = cloudData[cloudField];
            }
        }
        
        // 特殊处理更新时间字段
        if (cloudData.updated_at && !localData.updateTime) {
            localData.updateTime = cloudData.updated_at;
        }
        if (cloudData.created_at && !localData.createTime) {
            localData.createTime = cloudData.created_at;
        }
        
        // 特殊处理数组字段
        if (cloudData.water_quality_prob && !localData.waterQualityProb) {
            localData.waterQualityProb = cloudData.water_quality_prob;
        }
        if (cloudData.management_prob && !localData.managementProb) {
            localData.managementProb = cloudData.management_prob;
        }
        
        // 特殊处理调查员字段
        if (cloudData.investigators && !localData.investigator) {
            localData.investigator = cloudData.investigators;
        }
        
        // 特殊处理定时供水频次字段
        if (cloudData.supply_times_per_day !== undefined && !localData.supplyTimesPerDay) {
            localData.supplyTimesPerDay = cloudData.supply_times_per_day;
        }
        if (cloudData.supply_hours_per_time !== undefined && !localData.supplyHoursPerTime) {
            localData.supplyHoursPerTime = cloudData.supply_hours_per_time;
        }
        
        // 简单日志
        console.log('下载数据:', 'supplyTimesPerDay=' + localData.supplyTimesPerDay, 'supplyHoursPerTime=' + localData.supplyHoursPerTime);
        
        // 特殊处理第5步字段
        if (cloudData.fee_collected && !localData.feeCollected) {
            localData.feeCollected = cloudData.fee_collected;
        }
        if (cloudData.fee_per_ton && !localData.feePerTon) {
            localData.feePerTon = cloudData.fee_per_ton;
        }
        if (cloudData.fee_per_household && !localData.feePerHousehold) {
            localData.feePerHousehold = cloudData.fee_per_household;
        }
        if (cloudData.fee_per_person && !localData.feePerPerson) {
            localData.feePerPerson = cloudData.fee_per_person;
        }
        if (cloudData.fee_bearer && !localData.feeBearer) {
            localData.feeBearer = cloudData.fee_bearer;
        }
        if (cloudData.livestock_fee && !localData.livestockFee) {
            localData.livestockFee = cloudData.livestock_fee;
        }
        if (cloudData.livestock_fee_amount && !localData.livestockFeeAmount) {
            localData.livestockFeeAmount = cloudData.livestock_fee_amount;
        }
        if (cloudData.subsidy_mechanism && !localData.subsidyMechanism) {
            localData.subsidyMechanism = cloudData.subsidy_mechanism;
        }
        if (cloudData.county_management && !localData.countyManagement) {
            localData.countyManagement = cloudData.county_management;
        }
        if (cloudData.problem_type && !localData.problemType) {
            localData.problemType = cloudData.problem_type;
        }
        // 第4步字段反向映射
        if (cloudData.pollution_source && !localData.pollutionSource) {
            localData.pollutionSource = cloudData.pollution_source;
        }
        if (cloudData.repair_timeliness && !localData.repairTimeliness) {
            localData.repairTimeliness = cloudData.repair_timeliness;
        }
        // 定时供水频次字段反向映射
        if (cloudData.supply_times_per_day && !localData.supplyTimesPerDay) {
            localData.supplyTimesPerDay = cloudData.supply_times_per_day;
        }
        if (cloudData.supply_hours_per_time && !localData.supplyHoursPerTime) {
            localData.supplyHoursPerTime = cloudData.supply_hours_per_time;
        }
        // 特殊处理 households 数组
        if (cloudData.households && !localData.households) {
            localData.households = cloudData.households.map(function(h) {
                var isPoorStr = '';
                if (h.isPoor === true) {
                    isPoorStr = '脱贫人口';
                } else if (h.isPoor === false) {
                    isPoorStr = '非脱贫人口';
                } else {
                    isPoorStr = '';
                }
                return {
                    name: h.name || '',
                    isPoor: isPoorStr,
                    satisfied: h.satisfied || '',
                    suggestion: h.suggestion || ''
                };
            });
        }
        
        // 特殊处理简化版农户满意度
        if (cloudData.household_selections && !localData.householdSelections) {
            localData.householdSelections = cloudData.household_selections;
        }
        
        console.log('transformCloudToLocal 最终 householdDetails:', JSON.stringify(localData.householdDetails));
        
        // 反向转换布尔字段：true->"是"/"有", false->"否"/"无"
        var booleanFieldMapping = {
            'stable_source': 'stableSource',
            'service_info_posted': 'serviceInfoPosted',
            'health_certificate': 'healthCertificate',
            'fund_management': 'fundManagement',
            'unified_management': 'unifiedManagement'
        };
        for (var cloudBoolField in booleanFieldMapping) {
            var localBoolField = booleanFieldMapping[cloudBoolField];
            if (cloudData.hasOwnProperty(cloudBoolField)) {
                var val = cloudData[cloudBoolField];
                if (val === true) {
                    localData[localBoolField] = '是';
                } else if (val === false) {
                    localData[localBoolField] = '否';
                } else {
                    localData[localBoolField] = val;
                }
            }
        }
        
        // 反向转换"有"/"无"字段：true->"有", false->"无"
        var haveNotFieldMapping = {
            'quality_report': 'qualityReport',
            'treatment_equip': 'treatmentEquip',
            'disinfect_equip': 'disinfectEquip',
            'repair_info': 'repairInfo',
            'manager_health_cert': 'managerHealthCert'
        };
        for (var cloudHNField in haveNotFieldMapping) {
            var localHNField = haveNotFieldMapping[cloudHNField];
            if (cloudData.hasOwnProperty(cloudHNField)) {
                var hnVal = cloudData[cloudHNField];
                if (hnVal === true) {
                    localData[localHNField] = '有';
                } else if (hnVal === false) {
                    localData[localHNField] = '无';
                } else {
                    localData[localHNField] = hnVal;
                }
            }
        }
        
        return localData;
    }
    
    // 上传 Base64 照片到 Supabase Storage
    async function uploadBase64PhotoToStorage(base64Data, stationId, index) {
        try {
            // 解析 Base64 数据
            var byteString;
            if (base64Data.indexOf('data:') === 0) {
                byteString = atob(base64Data.split(',')[1]);
            } else {
                byteString = atob(base64Data);
            }
            
            var mimeString = 'image/jpeg';
            if (base64Data.indexOf('data:') === 0) {
                mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
            }
            
            var ab = new ArrayBuffer(byteString.length);
            var ia = new Uint8Array(ab);
            for (var i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            var blob = new Blob([ab], { type: mimeString });
            
            // 生成唯一文件名（只使用安全字符：字母、数字、下划线、连字符）
            var timestamp = Date.now();
            var randomStr = Math.random().toString(36).substring(2, 8);
            // 提取 stationId 中的字母和数字部分，移除中文和特殊字符
            var safeStationId = stationId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
            var uniqueName = 'photo_' + safeStationId + '_' + timestamp + '_' + randomStr + '_' + index + '.jpg';
            
            console.log('上传照片到 Storage:', uniqueName, '大小:', blob.size);
            
            // 上传到 Supabase Storage
            var { data, error } = await supabase
                .storage
                .from('survey-photos')
                .upload(uniqueName, blob, {
                    cacheControl: '3600',
                    upsert: false
                });
            
            if (error) {
                console.error('上传照片失败:', error);
                return null;
            }
            
            // 获取公开 URL
            var photoUrl = SUPABASE_URL + '/storage/v1/object/public/survey-photos/' + uniqueName;
            console.log('照片上传成功:', photoUrl);
            return photoUrl;
            
        } catch(e) {
            console.error('上传 Base64 照片失败:', e);
            return null;
        }
    }
    
    // 处理调查数据中的照片，将 Base64 上传到 Storage
    async function processSurveyPhotos(surveyData, stationId) {
        if (!surveyData.photos || !Array.isArray(surveyData.photos) || surveyData.photos.length === 0) {
            return surveyData;
        }
        
        console.log('处理调查照片:', stationId, surveyData.photos.length, '张');
        
        var processedPhotos = [];
        var hasBase64 = false;
        
        for (var i = 0; i < surveyData.photos.length; i++) {
            var photo = surveyData.photos[i];
            
            // 检查是否是 Base64 格式
            if (photo && photo.indexOf('data:image') === 0) {
                hasBase64 = true;
                console.log('照片', i, '是 Base64 格式，需要上传');
                
                // 上传到 Storage
                var photoUrl = await uploadBase64PhotoToStorage(photo, stationId, i);
                if (photoUrl) {
                    processedPhotos.push(photoUrl);
                } else {
                    // 上传失败，保留原样（但可能会导致数据库保存失败）
                    processedPhotos.push(photo);
                }
            } else if (photo && photo.indexOf('http') === 0) {
                // 已经是 URL，直接使用
                processedPhotos.push(photo);
            } else {
                // 其他格式，保留原样
                processedPhotos.push(photo);
            }
        }
        
        if (hasBase64) {
            console.log('照片处理完成，Base64 已转换为 URL');
            surveyData.photos = processedPhotos;
        }
        
        return surveyData;
    }
    
    // 保存调查记录
    async function saveSurvey(stationId, surveyData) {
        // 先处理照片（将 Base64 上传到 Storage）
        surveyData = await processSurveyPhotos(surveyData, stationId);
        
        // 本地保存（更新为包含 URL 的照片）
        Storage.saveSurvey(stationId, surveyData);
        
        // 转换数据格式
        var dataToSave = transformSurveyData(surveyData, stationId);
        
        if (!checkOnline()) {
            addToSyncQueue('surveys', stationId, 'UPSERT', dataToSave);
            return surveyData;
        }
        
        try {
            console.log('保存到云端:', stationId, 'supply_times_per_day=' + dataToSave.supply_times_per_day, 'supply_hours_per_time=' + dataToSave.supply_hours_per_time);
            
            var { data, error } = await supabase
                .from('surveys')
                .upsert(dataToSave, { onConflict: 'station_id' })
                .select()
                .single();
            
            if (error) {
                console.error('保存失败:', error);
                throw error;
            }
            
            console.log('保存成功:', data.station_id, '返回:', 'supply_times_per_day=' + data.supply_times_per_day, 'supply_hours_per_time=' + data.supply_hours_per_time);
            
            // 更新本地数据为云端返回的数据（确保一致性）
            if (data && data.station_id) {
                var localFormatData = transformCloudToLocal(data);
                Storage.saveSurvey(stationId, localFormatData);
                console.log('  本地数据已更新为云端返回的数据');
                console.log('  更新后本地 investigator:', localFormatData.investigator);
                console.log('  更新后本地 supplyTimesPerDay:', localFormatData.supplyTimesPerDay);
                console.log('  更新后本地 supplyHoursPerTime:', localFormatData.supplyHoursPerTime);
                console.log('  更新后本地 householdDetails:', JSON.stringify(localFormatData.householdDetails));
                return localFormatData;
            }
            
            return surveyData;
        } catch(e) {
            console.error('保存调查记录失败:', e);
            addToSyncQueue('surveys', stationId, 'UPSERT', dataToSave);
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
    
    // 删除云端调查记录
    async function deleteSurvey(stationId) {
        if (!checkOnline()) {
            addToSyncQueue('surveys', stationId, 'DELETE', { station_id: stationId });
            return true;
        }
        
        try {
            var { error } = await supabase
                .from('surveys')
                .delete()
                .eq('station_id', stationId);
            
            if (error) throw error;
            console.log('云端调查记录已删除:', stationId);
            return true;
        } catch(e) {
            console.error('删除云端调查记录失败:', e);
            addToSyncQueue('surveys', stationId, 'DELETE', { station_id: stationId });
            return false;
        }
    }
    
    // ========== 同步功能 ==========
    
    // 添加到同步队列
    function addToSyncQueue(table, recordId, operation, data) {
        // 如果添加的是 DELETE 操作，移除同一条记录的之前的 UPSERT 操作
        if (operation === 'DELETE') {
            syncQueue = syncQueue.filter(function(item) {
                return !(item.table === table && item.recordId === recordId);
            });
        }
        
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
        var failedQueue = []; // 保存失败的记录
        
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
                    if (item.operation === 'DELETE') {
                        // 删除云端调查记录
                        await supabase.from('surveys').delete().eq('station_id', item.recordId);
                        console.log('云端调查记录已删除:', item.recordId);
                    } else {
                        console.log('正在同步调查数据:', item.recordId);
                        
                        // 处理照片（将 Base64 转换为 URL）
                        var surveyDataToSync = item.data;
                        if (surveyDataToSync.photos && surveyDataToSync.photos.length > 0) {
                            // 检查是否有 Base64 照片
                            var hasBase64 = surveyDataToSync.photos.some(function(p) {
                                return p && p.indexOf('data:image') === 0;
                            });
                            
                            if (hasBase64) {
                                console.log('同步队列中的调查数据包含 Base64 照片，需要处理');
                                // 从本地获取原始调查数据
                                var localSurvey = Storage.getSurvey(item.recordId);
                                if (localSurvey && localSurvey.photos) {
                                    // 处理照片
                                    localSurvey = await processSurveyPhotos(localSurvey, item.recordId);
                                    // 重新转换数据格式
                                    surveyDataToSync = transformSurveyData(localSurvey, item.recordId);
                                }
                            }
                        }
                        
                        var { data: surveyData, error: surveyError } = await supabase
                            .from('surveys')
                            .upsert(surveyDataToSync, { onConflict: 'station_id' })
                            .select()
                            .single();
                        if (surveyError) {
                            console.error('调查同步失败:', item.recordId, surveyError);
                            throw surveyError;
                        }
                        console.log('调查同步成功:', item.recordId);
                    }
                } else if (item.table === 'drafts') {
                    if (item.operation === 'DELETE') {
                        await supabase.from('drafts').delete().eq('station_id', item.recordId);
                    } else {
                        await supabase.from('drafts').upsert(item.data, { onConflict: 'station_id' });
                    }
                }
                successCount++;
                console.log('同步成功:', item.table, item.recordId);
            } catch(e) {
                console.error('同步失败:', item.table, item.recordId, e);
                failCount++;
                // 保存失败的记录，稍后重试
                failedQueue.push(item);
            }
        }
        
        // 只保留失败的记录到队列
        syncQueue = failedQueue;
        Storage.set('sync_queue', syncQueue);
        console.log('同步完成: 成功', successCount, '失败', failCount, '剩余队列', syncQueue.length);
        
        Utils.showToast('同步完成: 成功 ' + successCount + ', 失败 ' + failCount);
        return { success: true, successCount: successCount, failCount: failCount };
    }
    
    // 清理本地重复站点
    function deduplicateLocalStations() {
        var central = Storage.getCentralStations();
        var dispersed = Storage.getDispersedStations();
        
        console.log('清理前:', '集中式', central.length, '分散式', dispersed.length);
        
        // 按 ID 去重
        var centralMap = {};
        central.forEach(function(s) {
            if (s.id) centralMap[s.id] = s;
        });
        
        var dispersedMap = {};
        dispersed.forEach(function(s) {
            if (s.id) dispersedMap[s.id] = s;
        });
        
        var newCentral = Object.values(centralMap);
        var newDispersed = Object.values(dispersedMap);
        
        console.log('清理后:', '集中式', newCentral.length, '分散式', newDispersed.length);
        
        Storage.saveCentralStations(newCentral);
        Storage.saveDispersedStations(newDispersed);
        
        return { central: newCentral.length, dispersed: newDispersed.length };
    }
    
    // 清理云端重复站点（只保留最新的一条）
    async function deduplicateCloudStations() {
        try {
            Utils.showToast('正在清理云端重复数据...');
            
            // 获取所有站点（包括 Supabase 内部 id 和站点 id）
            var { data, error } = await supabase
                .from('stations')
                .select('id, station_id: id, created_at')
                .eq('is_deleted', false)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            // 找出重复ID - 按站点 id 分组
            var stationIdMap = {};
            var duplicates = [];
            
            data.forEach(function(record) {
                var stationId = record.id; // 站点ID
                if (stationIdMap[stationId]) {
                    // 已存在，标记为重复（保留第一个/最新的，删除后面的）
                    duplicates.push(record);
                } else {
                    stationIdMap[stationId] = record;
                }
            });
            
            console.log('云端重复数据:', duplicates.length, '条');
            
            if (duplicates.length === 0) {
                return { deleted: 0 };
            }
            
            // 批量删除重复数据
            var deletedCount = 0;
            var batchSize = 50;
            
            for (var i = 0; i < duplicates.length; i += batchSize) {
                var batch = duplicates.slice(i, i + batchSize);
                // 使用 Supabase 内部 id 删除
                var ids = batch.map(function(r) { return r.id; });
                
                try {
                    var { error: delError } = await supabase
                        .from('stations')
                        .delete()
                        .in('id', ids);
                    
                    if (delError) {
                        console.error('删除批次失败:', delError);
                    } else {
                        deletedCount += batch.length;
                        console.log('已删除重复数据:', deletedCount, '/', duplicates.length);
                    }
                } catch(e) {
                    console.error('删除异常:', e);
                }
            }
            
            Utils.showToast('已清理云端 ' + deletedCount + ' 条重复数据');
            return { deleted: deletedCount };
        } catch(e) {
            console.error('清理云端重复数据失败:', e);
            return { deleted: 0, error: e };
        }
    }
    
    // 从云端拉取最新数据（单向同步，速度快）
    // skipStations: true=跳过站点同步，只同步调查和草稿
    async function pullFromCloud(skipStations) {
        if (!checkOnline()) {
            Utils.showToast('离线状态，无法更新');
            return false;
        }
        
        skipStations = skipStations !== false; // 默认跳过站点
        Utils.showToast(skipStations ? '正在获取调查数据...' : '正在更新数据...');
        
        try {
            // 清理存储空间，为同步做准备
            console.log('同步前清理缓存...');
            try {
                localStorage.removeItem('amap_geocode_cache_v2');
                localStorage.removeItem('amap_geocode_cache');
                for (var i = localStorage.length - 1; i >= 0; i--) {
                    var key = localStorage.key(i);
                    if (key && (key.indexOf('cache') >= 0 || key.indexOf('temp') >= 0)) {
                        localStorage.removeItem(key);
                    }
                }
            } catch(e) {
                console.log('清理缓存失败:', e);
            }
            
            // 1. 优先拉取调查记录（重要数据优先）
            Utils.showToast('正在获取调查记录...');
            console.log('开始拉取调查记录...');
            var surveyResult = await getSurveys();
            console.log('调查记录拉取完成，结果:', Object.keys(surveyResult || {}).length, '条');
            
            // 2. 拉取草稿
            console.log('开始拉取草稿...');
            await getDrafts();
            console.log('草稿拉取完成');
            
            // 3. 拉取站点数据（可选，快速模式跳过）
            if (!skipStations) {
                Utils.showToast('正在获取站点数据...');
                await getStations();
            }
            
            console.log('云端数据拉取完成');
            Utils.showToast('数据更新完成');
            
            return true;
        } catch(e) {
            console.error('更新数据失败:', e);
            Utils.showToast('更新失败: ' + e.message);
            return false;
        }
    }
    
    // 推送指定站点到云端
    async function pushStationsToCloud(stations) {
        if (!stations || stations.length === 0) return { success: 0, fail: 0 };
        
        var pushCount = 0;
        var failCount = 0;
        var batchSize = 50; // 减小批次大小
        var batches = Math.ceil(stations.length / batchSize);
        
        for (var batchIdx = 0; batchIdx < batches; batchIdx++) {
            var start = batchIdx * batchSize;
            var end = Math.min(start + batchSize, stations.length);
            var batch = stations.slice(start, end);
            
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
                    // 批量失败时，尝试逐条推送
                    console.log('尝试逐条推送...');
                    for (var i = 0; i < batch.length; i++) {
                        try {
                            var cleaned = cleanStationData(batch[i]);
                            var { error: singleError } = await supabase
                                .from('stations')
                                .upsert(cleaned, { onConflict: 'id' });
                            
                            if (singleError) {
                                console.error('单条推送失败:', batch[i].id, singleError);
                                failCount++;
                            } else {
                                pushCount++;
                            }
                        } catch(singleE) {
                            console.error('单条推送异常:', batch[i].id, singleE);
                            failCount++;
                        }
                    }
                } else {
                    pushCount += batch.length;
                    console.log('推送进度:', end, '/', stations.length);
                }
            } catch(e) {
                console.error('批量推送站点异常:', start, '-', end, e);
                // 异常时也尝试逐条推送
                for (var j = 0; j < batch.length; j++) {
                    try {
                        var cleaned2 = cleanStationData(batch[j]);
                        var { error: singleError2 } = await supabase
                            .from('stations')
                            .upsert(cleaned2, { onConflict: 'id' });
                        
                        if (singleError2) {
                            failCount++;
                        } else {
                            pushCount++;
                        }
                    } catch(singleE2) {
                        failCount++;
                    }
                }
            }
        }
        
        console.log('站点推送完成: 成功', pushCount, '失败', failCount);
        return { success: pushCount, fail: failCount };
    }
    
    // 数值字段列表
    var numericFields = ['lat', 'lng', 'population', 'households_count', 'water_supply_scale', 
                         'investment', 'construction_year', 'design_daily_supply', 
                         'actual_daily_supply', 'water_quality_ph', 'water_quality_turbidity',
                         'water_quality_residual_chlorine', 'water_quality_total_dissolved_solids'];
    
    // 清理站点数据
    function cleanStationData(station) {
        var cleaned = {};
        for (var i = 0; i < allowedStationFields.length; i++) {
            var field = allowedStationFields[i];
            if (station.hasOwnProperty(field)) {
                var value = station[field];
                
                // 处理空字符串
                if (value === '' || value === undefined) {
                    // 数值字段用 null，其他字段保留原值或空字符串
                    if (numericFields.indexOf(field) >= 0) {
                        cleaned[field] = null;
                    } else {
                        cleaned[field] = value;
                    }
                } else if (numericFields.indexOf(field) >= 0) {
                    // 数值字段转换为数字
                    var num = parseFloat(value);
                    cleaned[field] = isNaN(num) ? null : num;
                } else {
                    cleaned[field] = value;
                }
            }
        }
        // 如果没有created_at，添加当前时间
        if (!cleaned.created_at) {
            cleaned.created_at = new Date().toISOString();
        }
        return cleaned;
    }
    
    // 推送本地数据到云端（推送所有本地数据）
    // skipStations: true=跳过站点推送，只推送调查和草稿
    async function pushLocalToCloud(skipStations) {
        skipStations = skipStations !== false; // 默认跳过站点
        
        var localCentral = Storage.getCentralStations();
        var localDispersed = Storage.getDispersedStations();
        var localSurveys = Storage.getSurveys();
        var localDrafts = Storage.getDraftSurveys();
        
        var pushCount = 0;
        var failCount = 0;
        var firstError = null;
        
        // 批量推送站点（可选，快速模式跳过）
        if (!skipStations) {
            var allStations = localCentral.concat(localDispersed);
            console.log('准备推送站点:', allStations.length, '个');
            
            // 批量大小增加到1000
            var batchSize = 1000;
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
        } else {
            console.log('快速模式：跳过站点推送');
        }
        
        // 清理调查数据
        function cleanSurveyData(survey, stationId) {
            var cleaned = { station_id: stationId };
            
            console.log('清理调查数据:', stationId, '原始字段:', Object.keys(survey).join(', '));
            console.log('  managementProb:', JSON.stringify(survey.managementProb));
            console.log('  householdDetails:', JSON.stringify(survey.householdDetails));
            
            for (var key in survey) {
                // 跳过 stationId 和 _type 等内部字段
                if (key === 'stationId' || key === '_type') continue;
                
                // 映射字段名（使用调查字段映射）
                var dbField = surveyFieldMapping[key] || key;
                
                // 只保留允许的字段（使用 in 操作符更可靠）
                if (allowedSurveyFields.indexOf(dbField) >= 0) {
                    // 特殊处理 householdDetails，确保是数组
                    if (key === 'householdDetails') {
                        var hhValue = survey[key];
                        cleaned[dbField] = Array.isArray(hhValue) ? hhValue : [];
                        console.log('  映射字段:', key, '->', dbField, '值:', JSON.stringify(cleaned[dbField]));
                    } else {
                        cleaned[dbField] = survey[key];
                    }
                } else {
                    console.log('  跳过字段:', key, '->', dbField, '(不在允许列表中)');
                }
            }
            
            console.log('  清理后 household_details:', JSON.stringify(cleaned.household_details));
            
            // 如果没有created_at，添加当前时间
            if (!cleaned.created_at && survey.updateTime) {
                cleaned.created_at = survey.updateTime;
            }
            if (!cleaned.created_at) {
                cleaned.created_at = new Date().toISOString();
            }
            
            // 转换布尔字段："是"/"有"->true, "否"/"无"->false
            var booleanFields = ['stable_source', 'service_info_posted', 'health_certificate', 
                                 'fund_management', 'unified_management', 'quality_report',
                                 'treatment_equip', 'disinfect_equip', 'repair_info', 'manager_health_cert'];
            booleanFields.forEach(function(field) {
                if (cleaned[field] === '是' || cleaned[field] === '有') {
                    cleaned[field] = true;
                } else if (cleaned[field] === '否' || cleaned[field] === '无') {
                    cleaned[field] = false;
                }
            });
            
            // 确保数组字段是数组
            if (!Array.isArray(cleaned.water_quality_prob)) {
                cleaned.water_quality_prob = [];
            }
            if (!Array.isArray(cleaned.management_prob)) {
                cleaned.management_prob = [];
            }
            if (!cleaned.households) {
                cleaned.households = [];
            } else if (Array.isArray(cleaned.households)) {
                // 转换 households 中的 isPoor 字段
                cleaned.households = cleaned.households.map(function(h) {
                    var isPoorVal = h.isPoor;
                    if (isPoorVal === '脱贫人口') {
                        isPoorVal = true;
                    } else if (isPoorVal === '非脱贫人口') {
                        isPoorVal = false;
                    } else if (typeof isPoorVal !== 'boolean') {
                        isPoorVal = null;
                    }
                    return {
                        name: h.name || '',
                        isPoor: isPoorVal,
                        satisfied: h.satisfied || '',
                        suggestion: h.suggestion || ''
                    };
                });
            }
            if (!Array.isArray(cleaned.photos)) {
                cleaned.photos = [];
            }
            if (!Array.isArray(cleaned.household_selections)) {
                cleaned.household_selections = [];
            }
            if (!Array.isArray(cleaned.household_details)) {
                cleaned.household_details = [];
            } else {
                // 确保 household_details 中的 selection 是数组
                cleaned.household_details = cleaned.household_details.map(function(h) {
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
            
            // 记录清理后的数据
            console.log('清理后数据:', stationId);
            console.log('  management_prob:', JSON.stringify(cleaned.management_prob));
            console.log('  household_details:', JSON.stringify(cleaned.household_details));
            
            // 记录照片数量用于调试
            if (cleaned.photos.length > 0) {
                console.log('调查记录 ' + stationId + ' 包含 ' + cleaned.photos.length + ' 张照片');
                // 检查是否有 Base64 照片需要上传到 Storage
                var hasBase64 = cleaned.photos.some(function(p) {
                    return p && p.indexOf('data:image') === 0;
                });
                if (hasBase64) {
                    console.log('照片包含 Base64 数据，需要在 pushLocalToCloud 中处理');
                }
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
        
        // 先处理所有调查记录中的 Base64 照片
        console.log('处理调查记录中的照片...');
        for (var i = 0; i < surveyList.length; i++) {
            var surveyItem = surveyList[i];
            if (surveyItem.data.photos && surveyItem.data.photos.length > 0) {
                var hasBase64 = surveyItem.data.photos.some(function(p) {
                    return p && p.indexOf('data:image') === 0;
                });
                if (hasBase64) {
                    console.log('处理调查记录照片:', surveyItem.stationId);
                    surveyItem.data = await processSurveyPhotos(surveyItem.data, surveyItem.stationId);
                    // 更新本地存储（将 Base64 替换为 URL）
                    Storage.saveSurvey(surveyItem.stationId, surveyItem.data);
                }
            }
        }
        
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
                
                // 调试：查看第一条数据
                console.log('推送调查数据示例:', JSON.stringify(cleanedSurveyBatch[0], null, 2));
                console.log('数据字段:', Object.keys(cleanedSurveyBatch[0]).join(', '));
                
                var { data, error } = await supabase
                    .from('surveys')
                    .upsert(cleanedSurveyBatch, { onConflict: 'station_id' });
                
                if (error) {
                    console.error('批量推送调查记录失败:', sStart, '-', sEnd, JSON.stringify(error));
                    // 尝试逐条推送，找出哪条失败
                    console.log('尝试逐条推送...');
                    for (var i = 0; i < cleanedSurveyBatch.length; i++) {
                        try {
                            var singleResult = await supabase
                                .from('surveys')
                                .upsert(cleanedSurveyBatch[i], { onConflict: 'station_id' });
                            if (singleResult.error) {
                                console.error('单条推送失败:', cleanedSurveyBatch[i].station_id, JSON.stringify(singleResult.error));
                            } else {
                                console.log('单条推送成功:', cleanedSurveyBatch[i].station_id);
                                surveyCount++;
                            }
                        } catch(singleErr) {
                            console.error('单条推送异常:', cleanedSurveyBatch[i].station_id, singleErr);
                        }
                    }
                } else {
                    surveyCount += sBatch.length;
                }
            } catch(e) {
                console.error('批量推送调查记录异常:', sStart, '-', sEnd, e);
            }
        }
        console.log('调查记录推送完成:', surveyCount, '条');
        
        // 列出成功推送的调查记录ID
        if (surveyList.length > 0) {
            console.log('推送的调查记录ID:', surveyList.map(function(item) { return item.stationId; }).join(', '));
        }
        
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
            return { success: false, error: firstError.message || firstError.code, pushCount: pushCount };
        }
        
        return { success: true, pushCount: pushCount, surveyCount: surveyCount, draftCount: draftCount };
    }
    
    // ========== 本地缓存 ==========
    
    // 缓存站点数据（按 ID 去重）
    function cacheStations(stations) {
        // 按 ID 去重，保留最新的
        var idMap = {};
        stations.forEach(function(s) {
            if (s.id) {
                // 如果已存在，保留更新时间较新的
                if (!idMap[s.id] || (s.updated_at && idMap[s.id].updated_at && s.updated_at > idMap[s.id].updated_at)) {
                    idMap[s.id] = s;
                }
            }
        });
        
        var uniqueStations = Object.values(idMap);
        console.log('去重后站点数:', uniqueStations.length, '原站点数:', stations.length);
        
        var central = [];
        var dispersed = [];
        
        uniqueStations.forEach(function(s) {
            // 根据 ID 前缀或 type 字段判断类型
            var isCentral = false;
            if (s.id && s.id.startsWith('C')) {
                isCentral = true;
            } else if (s.type === 'central' || s.type === 'C') {
                isCentral = true;
            }
            
            if (isCentral) {
                central.push(s);
            } else {
                dispersed.push(s);
            }
        });
        
        console.log('分类结果:', '集中式', central.length, '分散式', dispersed.length);
        
        // 分批保存，避免超出存储限制
        var batchSize = 100; // 每批保存100个站点
        
        // 分批保存集中式站点
        var centralSaved = true;
        if (central.length > 0) {
            try {
                // 先尝试保存全部
                centralSaved = Storage.saveCentralStations(central);
                if (!centralSaved) {
                    console.log('集中式站点保存失败，尝试激进压缩...');
                    // 激进压缩：只保留必要字段
                    var minimalCentral = central.map(function(s) {
                        return {
                            id: s.id,
                            type: s.type,
                            name: s.name,
                            county: s.county,
                            town: s.town,
                            village: s.village,
                            hamlet: s.hamlet,
                            lat: s.lat,
                            lng: s.lng,
                            station_type: s.station_type
                        };
                    });
                    centralSaved = Storage.saveCentralStations(minimalCentral);
                    if (centralSaved) {
                        console.log('集中式站点激进压缩后保存成功');
                    } else {
                        console.error('集中式站点激进压缩后仍然失败');
                    }
                }
            } catch(e) {
                console.error('保存集中式站点失败:', e);
                centralSaved = false;
            }
        }
        
        // 分批保存分散式站点
        var dispersedSaved = true;
        if (dispersed.length > 0) {
            try {
                // 先尝试保存全部
                dispersedSaved = Storage.saveDispersedStations(dispersed);
                if (!dispersedSaved) {
                    console.log('分散式站点保存失败，尝试激进压缩...');
                    // 激进压缩
                    var minimalDispersed = dispersed.map(function(s) {
                        return {
                            id: s.id,
                            type: s.type,
                            name: s.name,
                            county: s.county,
                            town: s.town,
                            village: s.village,
                            hamlet: s.hamlet,
                            lat: s.lat,
                            lng: s.lng,
                            station_type: s.station_type
                        };
                    });
                    dispersedSaved = Storage.saveDispersedStations(minimalDispersed);
                    if (dispersedSaved) {
                        console.log('分散式站点激进压缩后保存成功');
                    } else {
                        console.error('分散式站点激进压缩后仍然失败');
                    }
                }
            } catch(e) {
                console.error('保存分散式站点失败:', e);
                dispersedSaved = false;
            }
        }
        
        if (!centralSaved || !dispersedSaved) {
            console.warn('站点数据缓存失败，可能超出存储限制');
            // 存储失败时，只在内存中保留数据（页面刷新后会丢失）
            window._tempCentralStations = central;
            window._tempDispersedStations = dispersed;
        }
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
    
    // 获取同步队列状态（调试用）
    function getSyncQueueStatus() {
        var queue = Storage.get('sync_queue') || [];
        var stats = {
            total: queue.length,
            stations: 0,
            surveys: 0,
            drafts: 0
        };
        
        queue.forEach(function(item) {
            if (item.table === 'stations') stats.stations++;
            else if (item.table === 'surveys') stats.surveys++;
            else if (item.table === 'drafts') stats.drafts++;
        });
        
        console.log('同步队列状态:', stats, queue);
        return { stats: stats, queue: queue };
    }
    
    // 清空同步队列（调试用）
    function clearSyncQueue() {
        syncQueue = [];
        Storage.set('sync_queue', []);
        console.log('同步队列已清空');
    }
    
    // ===== 清理云端重复数据 =====
    async function cleanupCloudDuplicates() {
        try {
            console.log('开始清理云端重复数据...');
            Utils.showToast('正在分析云端数据...');
            
            // 1. 分页获取所有站点（解决1000条限制）
            var allData = [];
            var page = 0;
            var pageSize = 1000;
            var hasMore = true;
            
            while (hasMore) {
                var { data, error: fetchError } = await supabase
                    .from('stations')
                    .select('id, name, created_at, ctid')
                    .eq('is_deleted', false)
                    .order('created_at', { ascending: false })
                    .range(page * pageSize, (page + 1) * pageSize - 1);
                
                if (fetchError) throw fetchError;
                
                if (data && data.length > 0) {
                    allData = allData.concat(data);
                    console.log(`获取第 ${page + 1} 页: ${data.length} 条，累计: ${allData.length}`);
                    
                    if (data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    hasMore = false;
                }
            }
            
            console.log('云端总记录数:', allData.length);
            
            // 2. 找出重复的ID（保留最新的）
            var seenIds = {};
            var duplicatesToDelete = [];
            var idDuplicateCount = 0;
            
            allData.forEach(function(record) {
                if (seenIds[record.id]) {
                    // 这是重复的，加入删除列表
                    duplicatesToDelete.push(record.ctid);
                    idDuplicateCount++;
                } else {
                    // 第一次出现，保留
                    seenIds[record.id] = true;
                }
            });
            
            console.log('按ID去重 - 发现重复记录:', idDuplicateCount, '条');
            
            // 3. 按站点名称再次去重（处理同一站点不同ID的情况）
            var nameGroups = {};
            allData.forEach(function(record) {
                var name = record.name || '';
                if (name) {
                    if (!nameGroups[name]) nameGroups[name] = [];
                    nameGroups[name].push(record);
                }
            });
            
            var nameDuplicateCount = 0;
            for (var name in nameGroups) {
                var group = nameGroups[name];
                if (group.length > 1) {
                    // 保留第一个（最新的），其他的标记为删除
                    for (var i = 1; i < group.length; i++) {
                        // 检查是否已经在删除列表中
                        if (duplicatesToDelete.indexOf(group[i].ctid) === -1) {
                            duplicatesToDelete.push(group[i].ctid);
                            nameDuplicateCount++;
                        }
                    }
                }
            }
            
            console.log('按名称去重 - 新增重复记录:', nameDuplicateCount, '条');
            console.log('总共需要删除:', duplicatesToDelete.length, '条');
            
            Utils.showToast(`发现 ${duplicatesToDelete.length} 条重复记录（ID重复${idDuplicateCount}条，名称重复${nameDuplicateCount}条）`);
            
            if (duplicatesToDelete.length === 0) {
                return { success: true, deleted: 0, message: '没有重复数据' };
            }
            
            // 4. 分批删除（每批100条）
            var deletedCount = 0;
            var batchSize = 100;
            var batches = Math.ceil(duplicatesToDelete.length / batchSize);
            
            Utils.showToast(`开始删除 ${duplicatesToDelete.length} 条重复记录...`);
            
            for (var i = 0; i < batches; i++) {
                var start = i * batchSize;
                var end = Math.min(start + batchSize, duplicatesToDelete.length);
                var batch = duplicatesToDelete.slice(start, end);
                
                // 使用ctid删除
                var { error: delError } = await supabase
                    .from('stations')
                    .delete()
                    .in('ctid', batch);
                
                if (delError) {
                    console.error('删除批次失败:', i, delError);
                } else {
                    deletedCount += batch.length;
                    console.log('已删除:', deletedCount, '/', duplicatesToDelete.length);
                    Utils.showToast(`已删除 ${deletedCount}/${duplicatesToDelete.length}...`);
                }
            }
            
            console.log('清理完成，删除重复记录:', deletedCount, '条');
            Utils.showToast(`清理完成！删除了 ${deletedCount} 条重复记录`);
            return { success: true, deleted: deletedCount };
            
        } catch(e) {
            console.error('清理云端重复数据失败:', e);
            Utils.showToast('清理失败: ' + e.message);
            return { success: false, error: e.message };
        }
    }
    
    // 返回公共接口
    return {
        // 站点
        getStations: getStations,
        saveStation: saveStation,
        deleteStation: deleteStation,
        
        // 调查记录
        getSurveys: getSurveys,
        saveSurvey: saveSurvey,
        deleteSurvey: deleteSurvey,
        
        // 草稿
        getDrafts: getDrafts,
        saveDraft: saveDraft,
        deleteDraft: deleteDraft,
        
        // 同步
        sync: sync,
        pullFromCloud: pullFromCloud,
        pushLocalToCloud: pushLocalToCloud,
        checkOnline: checkOnline,
        
        // 调试
        getSyncQueueStatus: getSyncQueueStatus,
        clearSyncQueue: clearSyncQueue,
        
        // 数据清理
        cleanupCloudDuplicates: cleanupCloudDuplicates,
        
        // 内部 supabase 实例（调试用）
        _supabase: supabase
    };
})();
