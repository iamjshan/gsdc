/**
 * survey-form.js - 调查表单定义与渲染
 * 基于《黑龙江省农村供水工程调查表》
 */

var SurveyForm = (function() {
    // 调查步骤定义
    var steps = [
        {
            id: 1,
            title: '基本信息',
            icon: '📍',
            desc: '站点位置与基本情况'
        },
        {
            id: 2,
            title: '水质水量',
            icon: '💧',
            desc: '水质与水量达标情况'
        },
        {
            id: 3,
            title: '供水保证',
            icon: '🔧',
            desc: '用水方便程度与供水保证率'
        },
        {
            id: 4,
            title: '工程管理',
            icon: '🏗️',
            desc: '工程状态与运行管护'
        },
        {
            id: 5,
            title: '费用管理',
            icon: '💰',
            desc: '水费收缴与补贴机制'
        },
        {
            id: 6,
            title: '群众满意度',
            icon: '👥',
            desc: '农户访问与意见建议'
        }
    ];

    // 渲染步骤内容
    function renderStep(stepNum, formData) {
        formData = formData || {};
        var html = '';
        
        switch(stepNum) {
            case 1: html = renderStep1(formData); break;
            case 2: html = renderStep2(formData); break;
            case 3: html = renderStep3(formData); break;
            case 4: html = renderStep4(formData); break;
            case 5: html = renderStep5(formData); break;
            case 6: html = renderStep6(formData); break;
        }
        
        return html;
    }

    // 第1步：基本信息
    function renderStep1(d) {
        return '<div class="survey-section">' +
            '<div class="survey-section-title">📍 基本信息</div>' +
            field('调查时间', 
                '<input type="date" class="form-control" id="f_surveyDate" value="' + (d.surveyDate || getTodayStr()) + '">') +
            field('县（市、区）',
                '<input type="text" class="form-control" id="f_county" placeholder="县（市、区）" value="' + esc(d.county) + '">') +
            field('乡镇',
                '<input type="text" class="form-control" id="f_town" placeholder="乡（镇）" value="' + esc(d.town) + '">') +
            field('村屯',
                '<div class="input-row">' +
                '<input type="text" class="form-control" id="f_village" placeholder="村" style="flex:1" value="' + esc(d.village) + '">' +
                '<input type="text" class="form-control" id="f_hamlet" placeholder="屯" style="flex:1" value="' + esc(d.hamlet) + '">' +
                '</div>') +
            field('工程名称',
                '<input type="text" class="form-control" id="f_projectName" placeholder="供水工程名称" value="' + esc(d.projectName) + '">') +
            field('工程类型',
                '<select class="form-control" id="f_projectType">' +
                opt(['城市管网延伸工程','千吨万人工程','千人供水工程','百人以上工程','其他集中式','农户自打井','大口井','山泉水','雨水收集'], d.projectType) +
                '</select>') +
            field('调查员',
                '<input type="text" class="form-control" id="f_investigator" placeholder="调查人员姓名" value="' + esc(d.investigator) + '">') +
            field('GPS坐标',
                '<div class="input-row">' +
                '<input type="number" class="form-control" id="f_lat" placeholder="纬度" step="0.000001" style="flex:1" value="' + esc(d.lat) + '">' +
                '<input type="number" class="form-control" id="f_lng" placeholder="经度" step="0.000001" style="flex:1" value="' + esc(d.lng) + '">' +
                '<button onclick="SurveyForm.getGPS()" style="padding:8px 12px;background:#1a6fbf;color:#fff;border:none;border-radius:6px;font-size:12px;white-space:nowrap;">📍定位</button>' +
                '</div>') +
        '</div>';
    }

    // 第2步：水质水量
    function renderStep2(d) {
        return '<div class="survey-section">' +
            '<div class="survey-section-title">💧 水质情况</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">水质是否符合要求？</div>' +
            radioGroup('f_waterQuality', ['符合要求', '不符合要求'], d.waterQuality) +
            '</div>' +
            '<div class="survey-item" id="waterQualityProblems">' +
            '<div class="survey-question">不符合原因（多选）：</div>' +
            checkGroup('f_waterQualityProb', ['有肉眼可见杂质','水质浑浊','水有异色','水有异味','长期饮用有不良反应'], d.waterQualityProb) +
            '</div>' +
            '</div>' +
            '<div class="survey-section">' +
            '<div class="survey-section-title">💧 水量情况</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">水量是否符合要求？</div>' +
            radioGroup('f_waterQuantity', ['符合要求', '不符合要求'], d.waterQuantity) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">供水方式：</div>' +
            radioGroup('f_supplyMode', ['24小时连续供水', '定时供水', '水龙头未入户（水井/水缸等）'], d.supplyMode) +
            '</div>' +
            '<div class="survey-item" id="timedSupplyItem">' +
            '<div class="survey-question">定时供水频次：</div>' +
            '<div class="input-row">' +
            '<input type="number" class="inline-input" id="f_supplyTimesPerDay" value="' + (d.supplyTimesPerDay || '') + '">' +
            '<span class="input-unit">次/日、</span>' +
            '<input type="number" class="inline-input" id="f_supplyHoursPerTime" value="' + (d.supplyHoursPerTime || '') + '">' +
            '<span class="input-unit">小时/次</span>' +
            '</div>' +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">不符合原因（描述）：</div>' +
            '<textarea class="form-control" id="f_waterQuantityDesc" placeholder="描述不符合表现...">' + esc(d.waterQuantityDesc) + '</textarea>' +
            '</div>' +
            '</div>';
    }

    // 第3步：用水方便程度与供水保证率
    function renderStep3(d) {
        return '<div class="survey-section">' +
            '<div class="survey-section-title">🚿 用水方便程度</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">用水方便程度评价：</div>' +
            radioGroup('f_convenience', [
                '达标（供水入户，或取水往返≤10分钟/≤400米水平距离/≤40米垂直距离）',
                '基本达标（取水往返≤20分钟/≤800米水平距离/≤80米垂直距离）',
                '不达标'
            ], d.convenience) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">不达标表现（描述）：</div>' +
            '<textarea class="form-control" id="f_convenienceDesc" placeholder="描述不达标情况...">' + esc(d.convenienceDesc) + '</textarea>' +
            '</div>' +
            '</div>' +
            '<div class="survey-section">' +
            '<div class="survey-section-title">🔒 供水保证率</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">供水保证率评价：</div>' +
            radioGroup('f_supplyGuarantee', [
                '达标（一年中水量不足天数 < 18天）',
                '基本达标（一年中水量不足天数 < 36天）',
                '不达标'
            ], d.supplyGuarantee) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">不达标表现（描述）：</div>' +
            '<textarea class="form-control" id="f_supplyGuaranteeDesc" placeholder="描述不达标情况...">' + esc(d.supplyGuaranteeDesc) + '</textarea>' +
            '</div>' +
            '</div>';
    }

    // 第4步：工程管理
    function renderStep4(d) {
        return '<div class="survey-section">' +
            '<div class="survey-section-title">🏗️ 供水工程状态</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">是否有稳定水源？</div>' +
            radioGroup('f_stableSource', ['是', '否'], d.stableSource) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">工程运行状态：</div>' +
            radioGroup('f_projectStatus', ['运行管护良好', '处于失管状态'], d.projectStatus) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">管护问题（多选）：</div>' +
            checkGroup('f_managementProb', [
                '无人期间未上锁',
                '水源周边存在污染源',
                '未设置围栏',
                '未设置水源标识',
                '未设置管理制度',
                '未设置明白卡',
                '明白卡内容不全面',
                '井室内部有杂物不整洁'
            ], d.managementProb) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">污染源类型（描述）：</div>' +
            '<input type="text" class="form-control" id="f_pollutionSource" placeholder="描述污染源..." value="' + esc(d.pollutionSource) + '">' +
            '</div>' +
            '</div>' +
            '<div class="survey-section">' +
            '<div class="survey-section-title">🔬 设备与检测</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">水质检测报告：</div>' +
            radioGroup('f_qualityReport', ['有', '无'], convertYesNoToHaveNot(d.qualityReport)) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">水处理设备：</div>' +
            radioGroup('f_treatmentEquip', ['有', '无'], convertYesNoToHaveNot(d.treatmentEquip)) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">消毒设备：</div>' +
            radioGroup('f_disinfectEquip', ['有', '无'], convertYesNoToHaveNot(d.disinfectEquip)) +
            '</div>' +
            '</div>' +
            '<div class="survey-section">' +
            '<div class="survey-section-title">🔧 维修服务</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">维修服务信息公示：</div>' +
            radioGroup('f_repairInfo', ['有', '无'], convertYesNoToHaveNot(d.repairInfo)) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">维修服务时限：</div>' +
            radioGroup('f_repairTimeliness', ['及时', '不及时'], d.repairTimeliness) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">水管员健康证：</div>' +
            radioGroup('f_managerHealthCert', ['有', '无'], convertYesNoToHaveNot(d.managerHealthCert)) +
            '</div>' +
            '</div>';
    }

    // 第5步：费用管理
    function renderStep5(d) {
        return '<div class="survey-section">' +
            '<div class="survey-section-title">💰 水费收缴情况</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">是否收取水费？</div>' +
            radioGroup('f_feeCollected', ['收取水费', '未收取水费'], d.feeCollected) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">水费标准：</div>' +
            '<div style="display:flex;flex-direction:column;gap:8px;">' +
            '<div class="input-row"><input type="number" class="inline-input" id="f_feePerTon" value="' + esc(d.feePerTon) + '" step="0.01"><span class="input-unit">元/吨</span></div>' +
            '<div class="input-row"><input type="number" class="inline-input" id="f_feePerHousehold" value="' + esc(d.feePerHousehold) + '" step="0.01"><span class="input-unit">元/户/年</span></div>' +
            '<div class="input-row"><input type="number" class="inline-input" id="f_feePerPerson" value="' + esc(d.feePerPerson) + '" step="0.01"><span class="input-unit">元/人/年</span></div>' +
            '</div>' +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">未收费运维费用承担方：</div>' +
            '<input type="text" class="form-control" id="f_feeBearer" placeholder="承担单位/组织..." value="' + esc(d.feeBearer) + '">' +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">大牲畜养殖收费：</div>' +
            radioGroup('f_livestockFee', ['缴费', '不缴费'], d.livestockFee) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">大牲畜收费标准：</div>' +
            '<div class="input-row"><input type="number" class="inline-input" id="f_livestockFeeAmount" value="' + esc(d.livestockFeeAmount) + '" step="0.01"><span class="input-unit">元/头/年</span></div>' +
            '</div>' +
            '</div>' +
            '<div class="survey-section">' +
            '<div class="survey-section-title">💼 补贴与资金管理</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">是否具有补贴机制？</div>' +
            radioGroup('f_subsidyMechanism', ['具有补贴机制', '不具有补贴机制'], d.subsidyMechanism) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">资金管理情况：</div>' +
            radioGroup('f_fundManagement', ['有', '无'], d.fundManagement) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">县域统管管理：</div>' +
            radioGroup('f_countyManagement', ['有', '无'], d.countyManagement) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">问题类型（描述）：</div>' +
            '<input type="text" class="form-control" id="f_problemType" placeholder="发现的问题类型..." value="' + esc(d.problemType) + '">' +
            '</div>' +
            '</div>';
    }

    // 第6步：群众满意度
    function renderStep6(d) {
        // 使用对象数组存储3户的详细信息
        var households = d.householdDetails || [
            {name: '', selection: [], reason: ''},
            {name: '', selection: [], reason: ''},
            {name: '', selection: [], reason: ''}
        ];
        
        var html = '<div class="survey-section">' +
            '<div class="survey-section-title">👥 群众满意度调查</div>';
        
        for (var i = 0; i < 3; i++) {
            var h = households[i] || {name: '', selection: [], reason: ''};
            // 确保 selection 是数组
            var selections = Array.isArray(h.selection) ? h.selection : (h.selection ? [h.selection] : []);
            html += '<div class="survey-item" style="border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:12px;">' +
                '<div style="margin-bottom:10px;">' +
                '<label style="font-size:14px;color:#333;font-weight:600;">农户 ' + (i+1) + '</label>' +
                '<input type="text" class="form-control" id="f_household_' + i + '_name" placeholder="请输入姓名" value="' + esc(h.name) + '" style="margin-top:6px;">' +
                '</div>' +
                '<div style="margin-bottom:10px;">' +
                '<label style="font-size:13px;color:#666;">满意度（可多选）：</label>' +
                checkGroup('f_household_' + i + '_selection', ['满意', '不满意', '脱贫人口'], selections) +
                '</div>' +
                '<div>' +
                '<label style="font-size:13px;color:#666;">备注/原因：</label>' +
                '<textarea class="form-control" id="f_household_' + i + '_reason" placeholder="如有需要请填写备注或原因..." rows="2" style="margin-top:6px;">' + esc(h.reason) + '</textarea>' +
                '</div>' +
                '</div>';
        }
        
        html += '</div>' +
            // 建议及问题描述
            '<div class="survey-section">' +
            '<div class="survey-section-title">📝 建议及问题描述</div>' +
            '<div class="survey-item">' +
            '<textarea class="form-control" id="f_problemSummary" placeholder="请输入调查中发现的问题及建议..." rows="4">' + esc(d.problemSummary) + '</textarea>' +
            '</div>' +
            '</div>' +
            // 照片上传区域
            '<div class="survey-section">' +
            '<div class="survey-section-title">📷 现场照片（最多9张）</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">上传现场照片：</div>' +
            '<div class="photo-upload-area" id="photoUploadArea">' +
            '<div class="photo-grid" id="photoGrid">' +
            renderPhotoPreview(currentPhotos) +
            '</div>' +
            '<div class="photo-upload-btn" onclick="SurveyForm.selectPhotos()" style="display:' + (currentPhotos.length >= 9 ? 'none' : 'flex') + '">' +
            '<span class="upload-icon">+</span>' +
            '<span class="upload-text">点击添加照片</span>' +
            '</div>' +
            '</div>' +
            '<div class="photo-hint">支持 JPG/PNG 格式，单张不超过 5MB，最多上传 9 张照片</div>' +
            '</div>' +
            '</div>';
        
        return html;
    }
    
    // 渲染照片预览
    function renderPhotoPreview(photos) {
        var html = '';
        photos.forEach(function(url, index) {
            html += '<div class="photo-item" data-index="' + index + '">' +
                '<img src="' + url + '" alt="照片' + (index + 1) + '">' +
                '<div class="photo-delete" onclick="SurveyForm.deletePhoto(' + index + ')">×</div>' +
                '</div>';
        });
        return html;
    }

    // 收集当前步骤数据
    function collectStepData(stepNum) {
        var data = {};
        var inputs = document.querySelectorAll('#surveyFormContent input, #surveyFormContent select, #surveyFormContent textarea');
        inputs.forEach(function(el) {
            if (!el.id) return;
            var key;
            if (el.type === 'checkbox') {
                key = el.name.replace('f_', '');
                if (!data[key]) data[key] = [];
                if (el.checked) data[key].push(el.value || el.dataset.val);
            } else {
                key = el.id.replace('f_', '');
                data[key] = el.value;
            }
        });
        
        // 收集单选按钮组
        var selectedRadios = document.querySelectorAll('#surveyFormContent .radio-btn.selected');
        selectedRadios.forEach(function(btn) {
            var group = btn.dataset.group;
            if (group) {
                data[group.replace('f_','')] = btn.dataset.val;
            }
        });
        
        // 收集农户满意度数据（只在第6步时收集）
        var hasHouseholdInputs = document.getElementById('f_household_0_name') !== null;
        if (hasHouseholdInputs) {
            data.householdDetails = [];
            for (var i = 0; i < 3; i++) {
                var nameInput = document.getElementById('f_household_' + i + '_name');
                var reasonInput = document.getElementById('f_household_' + i + '_reason');
                var selectionKey = 'household_' + i + '_selection';
                var selections = data[selectionKey] || [];
                data.householdDetails.push({
                    name: nameInput ? nameInput.value : '',
                    selection: selections,
                    reason: reasonInput ? reasonInput.value : ''
                });
            }
        }
        
        // 收集照片数据
        data.photos = currentPhotos;
        
        // 转换"有"/"无"为"是"/"否"
        var haveNotFields = ['qualityReport', 'treatmentEquip', 'disinfectEquip', 'repairInfo', 'managerHealthCert'];
        haveNotFields.forEach(function(field) {
            if (data[field] === '有') data[field] = '是';
            else if (data[field] === '无') data[field] = '否';
        });
        
        // 简单日志
        console.log('收集数据:', 'supplyTimesPerDay=' + data.supplyTimesPerDay, 'supplyHoursPerTime=' + data.supplyHoursPerTime);
        
        return data;
    }

    // ===== 辅助函数 =====
    function field(label, inputHtml) {
        return '<div class="survey-item"><div class="survey-question">' + label + '</div>' + inputHtml + '</div>';
    }

    function radioGroup(name, options, selectedVal) {
        var html = '<div class="radio-row">';
        options.forEach(function(opt) {
            var isSelected = opt === selectedVal || (selectedVal && opt.indexOf(selectedVal) === 0);
            html += '<div class="radio-btn' + (isSelected ? ' selected' : '') + '" data-group="' + name + '" data-val="' + esc(opt) + '" onclick="SurveyForm.selectRadio(this)">' + esc(opt) + '</div>';
        });
        html += '</div>';
        return html;
    }

    function radioInlineBtn(name, options, selectedVal) {
        var html = '';
        options.forEach(function(opt) {
            var isSelected = opt === selectedVal;
            html += '<div class="radio-btn' + (isSelected ? ' selected' : '') + '" data-group="' + name + '" data-val="' + esc(opt) + '" onclick="SurveyForm.selectRadio(this)">' + esc(opt) + '</div>';
        });
        return html;
    }

    function checkGroup(name, options, selectedVals) {
        selectedVals = selectedVals || [];
        var html = '<div class="checkbox-group">';
        options.forEach(function(opt) {
            var isChecked = selectedVals.indexOf(opt) >= 0;
            html += '<div class="checkbox-item">' +
                '<input type="checkbox" id="' + name + '_' + opt + '" name="' + name + '" value="' + esc(opt) + '"' + (isChecked ? ' checked' : '') + '>' +
                '<label for="' + name + '_' + opt + '">' + esc(opt) + '</label>' +
                '</div>';
        });
        html += '</div>';
        return html;
    }

    function opt(options, selected) {
        return options.map(function(o) {
            return '<option value="' + esc(o) + '"' + (o === selected ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('');
    }

    function esc(v) { return Utils ? Utils.escapeHtml(v||'') : String(v||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    // 转换"是"/"否"为"有"/"无"（用于渲染）
    function convertYesNoToHaveNot(val) {
        if (val === '是') return '有';
        if (val === '否') return '无';
        return val;
    }

    function getTodayStr() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }

    // 单选选择
    function selectRadio(el) {
        var group = el.dataset.group;
        document.querySelectorAll('[data-group="' + group + '"]').forEach(function(btn) {
            btn.classList.remove('selected');
        });
        el.classList.add('selected');
    }

    // GPS定位
    function getGPS() {
        var getPos = function(lat, lng) {
            var latEl = document.getElementById('f_lat');
            var lngEl = document.getElementById('f_lng');
            if (latEl) latEl.value = lat.toFixed(6);
            if (lngEl) lngEl.value = lng.toFixed(6);
            Utils.showToast('定位成功');
        };
        
        if (typeof plus !== 'undefined' && plus.geolocation) {
            plus.geolocation.getCurrentPosition(function(p) {
                getPos(p.coords.latitude, p.coords.longitude);
            }, function(e) {
                Utils.showToast('定位失败: ' + e.message);
            });
        } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(p) {
                getPos(p.coords.latitude, p.coords.longitude);
            }, function() {
                Utils.showToast('无法获取位置');
            });
        } else {
            Utils.showToast('设备不支持定位');
        }
    }

    // 当前照片数组
    var currentPhotos = [];
    
    // 选择照片
    function selectPhotos() {
        if (currentPhotos.length >= 9) {
            Utils.showToast('最多只能上传 9 张照片');
            return;
        }
        
        // 在 5+ App 中使用原生文件选择
        if (typeof plus !== 'undefined' && plus.gallery) {
            plus.gallery.pick(function(e) {
                if (e.files && e.files.length > 0) {
                    var remainingSlots = 9 - currentPhotos.length;
                    var filesToProcess = Math.min(e.files.length, remainingSlots);
                    
                    for (var i = 0; i < filesToProcess; i++) {
                        uploadPhoto(e.files[i]);
                    }
                }
            }, function(e) {
                console.log('取消选择照片');
            }, {
                filter: 'image',
                multiple: true,
                maximum: 9 - currentPhotos.length,
                system: false
            });
        } else {
            // Web 端使用 input file
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.onchange = function(e) {
                var files = e.target.files;
                var remainingSlots = 9 - currentPhotos.length;
                var filesToProcess = Math.min(files.length, remainingSlots);
                
                for (var i = 0; i < filesToProcess; i++) {
                    uploadPhotoWeb(files[i]);
                }
            };
            input.click();
        }
    }
    
    // Supabase 配置
    var SUPABASE_URL = 'https://lyozfvgmagykymkpvloq.supabase.co';
    var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5b3pmdmdtYWd5a3ltcHZsb3EiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3Njc0MzIzNywiZXhwIjoyMDkyMzIwODM3fQ.bGPs3J_0qFnq_Nygkn0l5qWqZhV42JnrKZXC2Q-UeGU';
    
    // 获取 Supabase 客户端
    function getSupabaseClient() {
        if (typeof supabase !== 'undefined' && supabase.createClient) {
            return supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
        // 如果全局 supabase 不可用，尝试使用 SupabaseClient
        if (window.SupabaseClient && window.SupabaseClient._supabase) {
            return window.SupabaseClient._supabase;
        }
        return null;
    }
    
    // 上传照片（5+ App）
    function uploadPhoto(filePath) {
        Utils.showToast('正在上传照片...');
        console.log('开始上传照片，路径:', filePath);
        
        // 检查 Supabase 客户端
        var supabaseClient = getSupabaseClient();
        if (!supabaseClient) {
            console.error('Supabase 客户端不可用');
            Utils.showToast('上传功能初始化失败，请刷新页面重试');
            return;
        }
        
        // 读取文件为 base64
        plus.io.resolveLocalFileSystemURL(filePath, function(entry) {
            entry.file(function(file) {
                console.log('文件信息:', file.name, '大小:', file.size);
                
                // 生成唯一文件名
                var timestamp = Date.now();
                var randomStr = Math.random().toString(36).substr(2, 9);
                var ext = file.name.split('.').pop() || 'jpg';
                var uniqueName = timestamp + '_' + randomStr + '.' + ext;
                
                console.log('目标文件名:', uniqueName);
                
                // 使用 plus.io.FileReader 读取文件
                var reader = new plus.io.FileReader();
                reader.onload = function(e) {
                    var base64Data = e.target.result;
                    console.log('FileReader 成功，数据长度:', base64Data ? base64Data.length : 0);
                    
                    // 转换为 Blob
                    var byteString;
                    if (base64Data.indexOf(',') > -1) {
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
                    
                    console.log('Blob 创建成功，大小:', blob.size);
                    
                    // 使用 Supabase 客户端上传
                    supabaseClient.storage
                        .from('survey-photos')
                        .upload(uniqueName, blob, {
                            cacheControl: '3600',
                            upsert: false
                        })
                        .then(function(result) {
                            if (result.error) {
                                console.error('Supabase 上传错误:', JSON.stringify(result.error));
                                throw result.error;
                            }
                            
                            console.log('上传成功:', result.data);
                            
                            // 获取公开 URL
                            var photoUrl = SUPABASE_URL + '/storage/v1/object/public/survey-photos/' + uniqueName;
                            currentPhotos.push(photoUrl);
                            updatePhotoGrid();
                            Utils.showToast('照片上传成功 (' + currentPhotos.length + '/9)');
                        })
                        .catch(function(error) {
                            console.error('上传照片失败:', error);
                            console.error('错误详情:', JSON.stringify(error));
                            
                            // 备选方案：压缩并存储 base64 数据
                            console.log('使用备选方案：压缩并存储 base64 数据');
                            Utils.showToast('云存储失败，使用本地存储...');
                            
                            // 压缩图片（质量0.5以节省空间）
                            compressImage(base64Data, 800, 0.5, function(compressedData) {
                                currentPhotos.push(compressedData);
                                updatePhotoGrid();
                                Utils.showToast('照片已保存(' + currentPhotos.length + '/9)，大小:' + Math.round(compressedData.length/1024) + 'KB');
                            });
                        });
                };
                
                reader.onerror = function(e) {
                    console.error('FileReader 错误:', e);
                    Utils.showToast('读取照片失败');
                };
                
                reader.readAsDataURL(file);
            });
        }, function(e) {
            console.error('读取文件失败:', e);
            Utils.showToast('读取文件失败');
        });
    }
    
    // 压缩图片（使用 canvas）
    function compressImage(base64Data, maxWidth, quality, callback) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            
            // 计算新的尺寸
            var width = img.width;
            var height = img.height;
            
            if (width > maxWidth) {
                height = Math.round(height * maxWidth / width);
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // 绘制压缩后的图片
            ctx.drawImage(img, 0, 0, width, height);
            
            // 输出为 base64
            var compressed = canvas.toDataURL('image/jpeg', quality);
            console.log('图片压缩完成：原图 ' + base64Data.length + ' -> 压缩后 ' + compressed.length);
            callback(compressed);
        };
        img.onerror = function() {
            console.error('图片加载失败，使用原图');
            callback(base64Data);
        };
        img.src = base64Data;
    }
    
    // 上传照片（Web 端）- 使用 Base64 暂存，自动压缩
    function uploadPhotoWeb(file) {
        // 显示处理提示
        Utils.showToast('正在处理照片...');
        
        var reader = new FileReader();
        reader.onload = function(e) {
            var base64Url = e.target.result;
            
            // 自动压缩图片：最大宽度800px，质量0.5
             compressImage(base64Url, 800, 0.5, function(compressedData) {
                 // 检查压缩后大小，如果还超过100KB，再次压缩
                 if (compressedData.length > 100000) {
                     console.log('照片仍然过大，进行二次压缩');
                     compressImage(compressedData, 600, 0.4, function(recompressedData) {
                         addPhotoToList(recompressedData, base64Url.length, recompressedData.length);
                     });
                 } else {
                     addPhotoToList(compressedData, base64Url.length, compressedData.length);
                 }
             });
        };
        reader.readAsDataURL(file);
    }
    
    // 添加照片到列表
    function addPhotoToList(compressedData, originalSize, finalSize) {
        // 限制单张照片最大100KB
        if (compressedData.length > 100000) {
            Utils.showToast('照片过大，请重新拍摄或选择更小的照片（限制100KB）');
            return;
        }
        
        currentPhotos.push(compressedData);
        updatePhotoGrid();
        var originalKB = Math.round(originalSize / 1024);
        var finalKB = Math.round(finalSize / 1024);
        Utils.showToast('照片已添加 (' + currentPhotos.length + '/9)，' + finalKB + 'KB');
        console.log('照片压缩：' + originalKB + 'KB → ' + finalKB + 'KB，压缩率: ' + Math.round((1 - finalKB/originalKB) * 100) + '%');
    }
    
    // 删除照片
    function deletePhoto(index) {
        if (index >= 0 && index < currentPhotos.length) {
            currentPhotos.splice(index, 1);
            updatePhotoGrid();
            Utils.showToast('照片已删除');
        }
    }
    
    // 更新照片网格显示
    function updatePhotoGrid() {
        var grid = document.getElementById('photoGrid');
        if (grid) {
            grid.innerHTML = renderPhotoPreview(currentPhotos);
        }
        
        // 更新上传按钮显示状态
        var uploadBtn = document.querySelector('.photo-upload-btn');
        if (uploadBtn) {
            uploadBtn.style.display = currentPhotos.length >= 9 ? 'none' : 'flex';
        }
    }
    
    // 设置当前照片（用于编辑时）
    function setPhotos(photos) {
        currentPhotos = photos || [];
        updatePhotoGrid();
    }
    
    // 获取当前照片
    function getPhotos() {
        return currentPhotos;
    }
    
    // 清除照片
    function clearPhotos() {
        currentPhotos = [];
    }

    return {
        steps: steps,
        renderStep: renderStep,
        collectStepData: collectStepData,
        selectRadio: selectRadio,
        getGPS: getGPS,
        // 照片相关方法
        selectPhotos: selectPhotos,
        deletePhoto: deletePhoto,
        setPhotos: setPhotos,
        getPhotos: getPhotos,
        clearPhotos: clearPhotos
    };
})();
