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
            '<div class="survey-section-title">📍 一、调查基本信息</div>' +
            // 调查时间
            field('调查时间', 
                '<input type="date" class="form-control" id="f_surveyDate" value="' + (d.surveyDate || getTodayStr()) + '">') +
            // 地点
            field('调查地点', 
                '<div class="input-row">' +
                '<input type="text" class="form-control" id="f_county" placeholder="县（市、区）" style="flex:1" value="' + esc(d.county) + '">' +
                '</div>') +
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
            '<div class="survey-section-title">💧 二、水质情况</div>' +
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
            '<div class="survey-section-title">💧 三、水量情况</div>' +
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
            '<input type="number" class="inline-input" id="f_supplyTimesPerDay" value="' + esc(d.supplyTimesPerDay) + '">' +
            '<span class="input-unit">次/日、</span>' +
            '<input type="number" class="inline-input" id="f_supplyHoursPerTime" value="' + esc(d.supplyHoursPerTime) + '">' +
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
            '<div class="survey-section-title">🚿 四、用水方便程度</div>' +
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
            '<div class="survey-section-title">🔒 五、供水保证率</div>' +
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
            '<div class="survey-section-title">🏗️ 六、供水工程状态</div>' +
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
            '<div class="survey-section-title">🔬 七、设备与检测</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">水质检测报告：</div>' +
            radioGroup('f_qualityReport', ['有', '无'], d.qualityReport) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">水处理设备：</div>' +
            radioGroup('f_treatmentEquip', ['有', '无'], d.treatmentEquip) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">消毒设备：</div>' +
            radioGroup('f_disinfectEquip', ['有', '无'], d.disinfectEquip) +
            '</div>' +
            '</div>' +
            '<div class="survey-section">' +
            '<div class="survey-section-title">🔧 八、维修服务</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">维修服务信息公示：</div>' +
            radioGroup('f_repairInfo', ['有', '无'], d.repairInfo) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">维修服务时限：</div>' +
            radioGroup('f_repairTimeliness', ['及时', '不及时'], d.repairTimeliness) +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">水管员健康证：</div>' +
            radioGroup('f_managerHealthCert', ['有', '无'], d.managerHealthCert) +
            '</div>' +
            '</div>';
    }

    // 第5步：费用管理
    function renderStep5(d) {
        return '<div class="survey-section">' +
            '<div class="survey-section-title">💰 九、水费收缴情况</div>' +
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
            '<div class="survey-section-title">💼 十、补贴与资金管理</div>' +
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
        var households = d.households || [{name:'',isPoor:false,satisfied:'',suggestion:''},{name:'',isPoor:false,satisfied:'',suggestion:''},{name:'',isPoor:false,satisfied:'',suggestion:''}];
        var html = '<div class="survey-section">' +
            '<div class="survey-section-title">👥 十一、群众满意度调查</div>';
        
        for (var i = 0; i < 3; i++) {
            var h = households[i] || {};
            html += '<div class="survey-item">' +
                '<div class="survey-question">农户 ' + (i+1) + '：</div>' +
                '<div style="display:flex;flex-direction:column;gap:8px;">' +
                '<input type="text" class="form-control" id="f_household_' + i + '_name" placeholder="农户姓名" value="' + esc(h.name) + '">' +
                '<div class="radio-row">' +
                '<label style="font-size:12px;color:#666;">是否脱贫人口：</label>' +
                radioInlineBtn('f_household_' + i + '_isPoor', ['脱贫人口', '非脱贫人口'], h.isPoor ? '脱贫人口' : '非脱贫人口') +
                '</div>' +
                '<div class="radio-row">' +
                radioInlineBtn('f_household_' + i + '_satisfied', ['满意', '不满意'], h.satisfied) +
                '</div>' +
                '<input type="text" class="form-control" id="f_household_' + i + '_suggestion" placeholder="意见建议..." value="' + esc(h.suggestion) + '">' +
                '</div>' +
                '</div>';
        }
        
        html += '</div>' +
            '<div class="survey-section">' +
            '<div class="survey-section-title">📝 十二、综合建议与问题</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">调查发现问题汇总：</div>' +
            '<textarea class="form-control" id="f_problemSummary" rows="4" placeholder="填写发现的主要问题...">' + esc(d.problemSummary) + '</textarea>' +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">综合建议：</div>' +
            '<textarea class="form-control" id="f_suggestions" rows="4" placeholder="填写整改建议...">' + esc(d.suggestions) + '</textarea>' +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">调查时间：</div>' +
            '<div class="input-row">' +
            '<input type="date" class="form-control" id="f_finalDate" value="' + (d.finalDate || getTodayStr()) + '">' +
            '</div>' +
            '</div>' +
            '<div class="survey-item">' +
            '<div class="survey-question">调查人员：</div>' +
            '<input type="text" class="form-control" id="f_investigators" placeholder="全部调查人员姓名" value="' + esc(d.investigators) + '">' +
            '</div>' +
            '</div>';
        
        return html;
    }

    // 收集当前步骤数据
    function collectStepData(stepNum) {
        var data = {};
        var inputs = document.querySelectorAll('#surveyFormContent input, #surveyFormContent select, #surveyFormContent textarea');
        inputs.forEach(function(el) {
            if (!el.id) return;
            var key = el.id.replace('f_', '');
            if (el.type === 'checkbox') {
                if (!data[key]) data[key] = [];
                if (el.checked) data[key].push(el.value || el.dataset.val);
            } else {
                data[key] = el.value;
            }
        });
        
        // 收集单选按钮组
        document.querySelectorAll('#surveyFormContent .radio-btn.selected').forEach(function(btn) {
            var group = btn.dataset.group;
            if (group) data[group.replace('f_','')] = btn.dataset.val;
        });
        
        // 收集农户数据
        data.households = [];
        for (var i = 0; i < 3; i++) {
            var name = document.getElementById('f_household_' + i + '_name');
            var isPoorBtn = document.querySelector('[data-group="f_household_' + i + '_isPoor"].selected');
            var satisfiedBtn = document.querySelector('[data-group="f_household_' + i + '_satisfied"].selected');
            var suggestion = document.getElementById('f_household_' + i + '_suggestion');
            data.households.push({
                name: name ? name.value : '',
                isPoor: isPoorBtn ? isPoorBtn.dataset.val === '脱贫人口' : false,
                satisfied: satisfiedBtn ? satisfiedBtn.dataset.val : '',
                suggestion: suggestion ? suggestion.value : ''
            });
        }
        
        return data;
    }

    // ===== 辅助函数 =====
    function field(label, inputHtml) {
        return '<div class="survey-item"><div class="survey-question">' + label + '</div>' + inputHtml + '</div>';
    }

    function radioGroup(name, options, selectedVal) {
        var html = '<div class="radio-row">';
        options.forEach(function(opt) {
            var isSelected = opt === selectedVal || (opt.indexOf(selectedVal||'__none__') === 0);
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

    return {
        steps: steps,
        renderStep: renderStep,
        collectStepData: collectStepData,
        selectRadio: selectRadio,
        getGPS: getGPS
    };
})();
