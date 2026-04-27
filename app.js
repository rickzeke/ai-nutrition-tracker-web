/**
 * AI 营养饮食追踪器 - app.js
 * 所有交互功能、数据持久化 (localStorage)、图表绘制
 */

// ============================================================
// 全局状态
// ============================================================
const STATE = {
  foods: [],
  selectedFood: null,
  selectedMeal: 'breakfast',
  currentTab: 'record',
  historyView: 7, // 7 or 30 days
  aiRecognizedFoods: [],
  currentFile: null,
};

// ============================================================
// localStorage 键名
// ============================================================
const STORE_KEYS = {
  MEALS: 'nt_meals',
  GOALS: 'nt_goals',
  THEME: 'nt_theme',
};

// 默认目标
const DEFAULT_GOALS = { calories: 2000, protein: 60, carbs: 250, fat: 65 };

// ============================================================
// 工具函数
// ============================================================

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const wd = weekdays[d.getDay()];
  return `${month}/${day} 周${wd}`;
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function loadMeals() {
  try {
    const raw = localStorage.getItem(STORE_KEYS.MEALS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMeals(meals) {
  localStorage.setItem(STORE_KEYS.MEALS, JSON.stringify(meals));
}

function getTodayMeals() {
  const today = getToday();
  return loadMeals().filter(m => m.date === today);
}

function getMealsByDateRange(startDate, endDate) {
  return loadMeals().filter(m => m.date >= startDate && m.date <= endDate);
}

function loadGoals() {
  try {
    const raw = localStorage.getItem(STORE_KEYS.GOALS);
    return raw ? JSON.parse(raw) : { ...DEFAULT_GOALS };
  } catch {
    return { ...DEFAULT_GOALS };
  }
}

function saveGoals(goals) {
  localStorage.setItem(STORE_KEYS.GOALS, JSON.stringify(goals));
}

function loadTheme() {
  return localStorage.getItem(STORE_KEYS.THEME) || 'light';
}

function saveTheme(theme) {
  localStorage.setItem(STORE_KEYS.THEME, theme);
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type} toast-show`;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.className = 'toast';
  }, 2500);
}

// ============================================================
// 主题切换
// ============================================================

function initTheme() {
  const theme = loadTheme();
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = document.getElementById('themeToggle');
  toggle.classList.toggle('dark', theme === 'dark');
}

function handleThemeToggle() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  saveTheme(next);
  document.getElementById('themeToggle').classList.toggle('dark', next === 'dark');
  if (STATE.currentTab === 'history') {
    drawTrendChart();
  }
}

// ============================================================
// Tab 导航
// ============================================================

function initTabs() {
  const nav = document.getElementById('tabNav');
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });
}

function switchTab(tab) {
  STATE.currentTab = tab;
  // 更新导航按钮
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
  // 切换内容
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  // 刷新对应tab
  if (tab === 'dashboard') refreshDashboard();
  if (tab === 'history') { refreshHistory(); drawTrendChart(); }
  if (tab === 'goals') refreshGoals();
}

// ============================================================
// 食物搜索
// ============================================================

function initFoodSearch() {
  const searchInput = document.getElementById('foodSearch');
  const categoryFilter = document.getElementById('categoryFilter');

  searchInput.addEventListener('input', renderSearchResults);
  categoryFilter.addEventListener('change', renderSearchResults);

  // 初始展示热门食物
  renderSearchResults();
}

function filterFoods(query, category) {
  let results = STATE.foods;
  if (category && category !== 'all') {
    results = results.filter(f => f.category === category);
  }
  if (query) {
    const q = query.toLowerCase().trim();
    results = results.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q)
    );
  }
  // 最多显示30条
  return results.slice(0, 30);
}

function renderSearchResults() {
  const query = document.getElementById('foodSearch').value;
  const category = document.getElementById('categoryFilter').value;
  const results = filterFoods(query, category);
  const container = document.getElementById('searchResults');

  if (results.length === 0) {
    container.innerHTML = '<p class="empty-state">未找到匹配的食物</p>';
    return;
  }

  container.innerHTML = results.map(f => `
    <div class="search-result-item" data-food-id="${f.id}">
      <div class="result-info">
        <span class="result-name">${f.name}</span>
        <span class="result-cat">${f.category}</span>
      </div>
      <div class="result-nutrition">
        <span class="result-cal">🔥 ${f.calories} kcal</span>
        <span>🥩 ${f.protein}g</span>
        <span>🍚 ${f.carbs}g</span>
        <span>🥑 ${f.fat}g</span>
      </div>
      <span class="result-serving">${f.serving_name}</span>
    </div>
  `).join('');

  // 点击事件
  container.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.foodId);
      const food = STATE.foods.find(f => f.id === id);
      if (food) showFoodDetail(food);
    });
  });
}

// ============================================================
// 食物详情 & 添加
// ============================================================

function showFoodDetail(food) {
  STATE.selectedFood = food;
  const section = document.getElementById('foodDetail');
  section.style.display = 'block';

  document.getElementById('foodDetailName').textContent = food.name;
  document.getElementById('foodDetailCat').textContent = food.category;
  document.getElementById('ndCalories').textContent = food.calories;
  document.getElementById('ndProtein').textContent = food.protein;
  document.getElementById('ndCarbs').textContent = food.carbs;
  document.getElementById('ndFat').textContent = food.fat;
  document.getElementById('servingAmount').value = 1;
  document.getElementById('servingUnitName').textContent = food.serving_name;

  // 滚动到详情
  section.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateNutritionDisplay() {
  const food = STATE.selectedFood;
  if (!food) return;
  const amount = parseFloat(document.getElementById('servingAmount').value) || 0;

  document.getElementById('ndCalories').textContent = Math.round(food.calories * amount);
  document.getElementById('ndProtein').textContent = (food.protein * amount).toFixed(1);
  document.getElementById('ndCarbs').textContent = (food.carbs * amount).toFixed(1);
  document.getElementById('ndFat').textContent = (food.fat * amount).toFixed(1);
}

function initFoodDetail() {
  document.getElementById('servingAmount').addEventListener('input', updateNutritionDisplay);

  // 餐次选择
  document.querySelectorAll('.meal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.selectedMeal = btn.dataset.meal;
    });
  });

  // 添加食物按钮
  document.getElementById('btnAddFood').addEventListener('click', addFoodToToday);
}

function addFoodToToday() {
  const food = STATE.selectedFood;
  if (!food) return;

  const amount = parseFloat(document.getElementById('servingAmount').value) || 1;
  const meals = loadMeals();
  const today = getToday();

  const entry = {
    id: Date.now(),
    foodId: food.id,
    name: food.name,
    category: food.category,
    servingAmount: amount,
    servingUnit: food.serving_unit,
    servingName: food.serving_name,
    calories: Math.round(food.calories * amount),
    protein: parseFloat((food.protein * amount).toFixed(1)),
    carbs: parseFloat((food.carbs * amount).toFixed(1)),
    fat: parseFloat((food.fat * amount).toFixed(1)),
    meal: STATE.selectedMeal,
    date: today,
    timestamp: Date.now(),
  };

  meals.push(entry);
  saveMeals(meals);

  showToast(`已添加 ${food.name} (${entry.servingName} ×${amount})`);
  refreshTodayLog();
  if (STATE.currentTab === 'dashboard') refreshDashboard();
}

// ============================================================
// 今日饮食记录
// ============================================================

function initTodayLog() {
  document.getElementById('todayDate').textContent = formatDate(getToday());
  refreshTodayLog();
}

function refreshTodayLog() {
  const todayMeals = getTodayMeals();
  const mealsByType = { breakfast: [], lunch: [], dinner: [], snack: [] };
  let totalCals = 0, totalPro = 0, totalCarbs = 0, totalFat = 0;

  todayMeals.forEach(m => {
    mealsByType[m.meal].push(m);
    totalCals += m.calories;
    totalPro += m.protein;
    totalCarbs += m.carbs;
    totalFat += m.fat;
  });

  // 渲染各餐次
  for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
    const items = mealsByType[meal];
    const mealCals = items.reduce((s, m) => s + m.calories, 0);
    document.getElementById(`mealTotal-${meal}`).textContent = mealCals > 0 ? `${mealCals} kcal` : '';

    const container = document.getElementById(`mealItems-${meal}`);
    if (items.length === 0) {
      container.innerHTML = '<p class="empty-item">暂无记录</p>';
    } else {
      container.innerHTML = items.map(m => `
        <div class="meal-item">
          <div class="meal-item-info">
            <span class="meal-item-name">${m.name}</span>
            <span class="meal-item-serving">${m.servingName} ×${m.servingAmount}</span>
          </div>
          <div class="meal-item-stats">
            <span>🔥 ${m.calories}</span>
            <span>🥩 ${m.protein}</span>
            <span>🍚 ${m.carbs}</span>
            <span>🥑 ${m.fat}</span>
          </div>
          <button class="btn-remove-meal" data-id="${m.id}">✕</button>
        </div>
      `).join('');
    }
  }

  // 移除食物事件
  document.querySelectorAll('.btn-remove-meal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      removeMeal(id);
    });
  });

  // 更新总结
  document.getElementById('sumCalories').textContent = totalCals;
  document.getElementById('sumProtein').textContent = totalPro.toFixed(1);
  document.getElementById('sumCarbs').textContent = totalCarbs.toFixed(1);
  document.getElementById('sumFat').textContent = totalFat.toFixed(1);
}

function removeMeal(id) {
  const meals = loadMeals();
  const idx = meals.findIndex(m => m.id === id);
  if (idx === -1) return;
  const removed = meals[idx];
  meals.splice(idx, 1);
  saveMeals(meals);
  showToast(`已删除 ${removed.name}`, 'warn');
  refreshTodayLog();
  if (STATE.currentTab === 'dashboard') refreshDashboard();
}

// ============================================================
// 拍照模拟上传
// ============================================================

function initPhotoUpload() {
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const removeImg = document.getElementById('removeImg');
  const aiAddAll = document.getElementById('aiAddAll');

  uploadArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);
  removeImg.addEventListener('click', (e) => {
    e.stopPropagation();
    clearPhoto();
  });
  aiAddAll.addEventListener('click', addAllRecognizedFoods);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  STATE.currentFile = file;
  const reader = new FileReader();

  reader.onload = (ev) => {
    // 显示预览
    document.querySelector('.upload-placeholder').style.display = 'none';
    const preview = document.getElementById('uploadPreview');
    preview.style.display = 'block';
    document.getElementById('previewImg').src = ev.target.result;

    // 模拟AI识别
    simulateAIRecognition();
  };

  reader.readAsDataURL(file);
}

function clearPhoto() {
  document.querySelector('.upload-placeholder').style.display = '';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('previewImg').src = '';
  document.getElementById('aiResult').style.display = 'none';
  document.getElementById('fileInput').value = '';
  STATE.currentFile = null;
  STATE.aiRecognizedFoods = [];
}

function simulateAIRecognition() {
  const aiResult = document.getElementById('aiResult');
  const aiLoading = document.getElementById('aiLoading');
  const aiRecognized = document.getElementById('aiRecognized');
  const aiFoodItems = document.getElementById('aiFoodItems');

  // 显示加载
  aiResult.style.display = 'block';
  aiLoading.style.display = 'block';
  aiRecognized.style.display = 'none';

  // 模拟1.5-2.5秒的AI识别延迟
  const delay = 1500 + Math.random() * 1000;

  setTimeout(() => {
    aiLoading.style.display = 'none';
    aiRecognized.style.display = 'block';

    // 随机选2-4个食物作为识别结果
    const count = 2 + Math.floor(Math.random() * 3);
    const shuffled = [...STATE.foods].sort(() => 0.5 - Math.random());
    const recognized = shuffled.slice(0, count).map(f => ({
      ...f,
      confidence: Math.floor(70 + Math.random() * 29),
    }));

    STATE.aiRecognizedFoods = recognized;

    aiFoodItems.innerHTML = recognized.map(f => `
      <div class="ai-food-item" data-food-id="${f.id}">
        <div class="ai-food-item-info">
          <span class="ai-food-name">${f.name}</span>
          <span class="ai-food-cat">${f.category}</span>
        </div>
        <div class="ai-food-nutrition">
          <span>🔥 ${f.calories} kcal</span>
          <span>🥩 ${f.protein}g</span>
          <span>🍚 ${f.carbs}g</span>
          <span>🥑 ${f.fat}g</span>
        </div>
        <div class="ai-confidence">
          <div class="confidence-bar">
            <div class="confidence-fill" style="width:${f.confidence}%"></div>
          </div>
          <span>${f.confidence}%</span>
          <button class="btn-ai-remove" data-food-id="${f.id}">✕</button>
        </div>
      </div>
    `).join('');

    // 单个删除按钮
    aiFoodItems.querySelectorAll('.btn-ai-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fid = parseInt(btn.dataset.foodId);
        STATE.aiRecognizedFoods = STATE.aiRecognizedFoods.filter(f => f.id !== fid);
        btn.closest('.ai-food-item').remove();
        if (STATE.aiRecognizedFoods.length === 0) {
          aiRecognized.style.display = 'none';
        }
      });
    });

    // 点击某食物查看详情
    aiFoodItems.querySelectorAll('.ai-food-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-ai-remove')) return;
        const fid = parseInt(item.dataset.foodId);
        const food = STATE.foods.find(f => f.id === fid);
        if (food) showFoodDetail(food);
      });
    });
  }, delay);
}

function addAllRecognizedFoods() {
  if (STATE.aiRecognizedFoods.length === 0) return;
  const meals = loadMeals();
  const today = getToday();

  STATE.aiRecognizedFoods.forEach(f => {
    // 自动分配到正餐或加餐
    const meal = f.category === '饮料类' || f.category === '小吃类' || f.category === '水果类' ? 'snack' : STATE.selectedMeal;

    meals.push({
      id: Date.now() + Math.random(),
      foodId: f.id,
      name: f.name,
      category: f.category,
      servingAmount: 1,
      servingUnit: f.serving_unit,
      servingName: f.serving_name,
      calories: f.calories,
      protein: f.protein,
      carbs: f.carbs,
      fat: f.fat,
      meal: meal,
      date: today,
      timestamp: Date.now(),
    });
  });

  saveMeals(meals);
  showToast(`已添加 ${STATE.aiRecognizedFoods.length} 种食物`);
  clearPhoto();
  refreshTodayLog();
}

// ============================================================
// 仪表板 (Dashboard)
// ============================================================

function initDashboard() {
  document.getElementById('dashRefresh').addEventListener('click', () => {
    refreshDashboard();
    showToast('仪表板已刷新');
  });
}

function refreshDashboard() {
  const todayMeals = getTodayMeals();
  const goals = loadGoals();
  let totalCals = 0, totalPro = 0, totalCarbs = 0, totalFat = 0;

  todayMeals.forEach(m => {
    totalCals += m.calories;
    totalPro += m.protein;
    totalCarbs += m.carbs;
    totalFat += m.fat;
  });

  // 更新环形图
  updateRing('ringCalories', totalCals, goals.calories, 'ringCalValue', 'kcal');
  updateRing('ringProtein', totalPro, goals.protein, 'ringProValue', 'g');
  updateRing('ringCarbs', totalCarbs, goals.carbs, 'ringCarbValue', 'g');
  updateRing('ringFat', totalFat, goals.fat, 'ringFatValue', 'g');

  // 更新环形图副标题
  document.getElementById('ringCalSub').textContent = `目标 ${goals.calories} kcal`;
  document.getElementById('ringProSub').textContent = `目标 ${goals.protein} g`;
  document.getElementById('ringCarbSub').textContent = `目标 ${goals.carbs} g`;
  document.getElementById('ringFatSub').textContent = `目标 ${goals.fat} g`;

  // 宏量营养素分布
  const totalGrams = totalPro + totalCarbs + totalFat;
  if (totalGrams > 0) {
    const proPct = Math.round((totalPro / totalGrams) * 100);
    const carbPct = Math.round((totalCarbs / totalGrams) * 100);
    const fatPct = 100 - proPct - carbPct;

    document.getElementById('macroProtein').style.width = proPct + '%';
    document.getElementById('macroCarbs').style.width = carbPct + '%';
    document.getElementById('macroFat').style.width = fatPct + '%';
    document.getElementById('macroProPct').textContent = proPct + '%';
    document.getElementById('macroCarbPct').textContent = carbPct + '%';
    document.getElementById('macroFatPct').textContent = fatPct + '%';
  } else {
    document.getElementById('macroProtein').style.width = '0%';
    document.getElementById('macroCarbs').style.width = '0%';
    document.getElementById('macroFat').style.width = '0%';
    document.getElementById('macroProPct').textContent = '0%';
    document.getElementById('macroCarbPct').textContent = '0%';
    document.getElementById('macroFatPct').textContent = '0%';
  }

  // AI建议
  generateDashboardSuggestion(totalCals, totalPro, totalCarbs, totalFat, goals);
}

/**
 * 更新SVG环形进度
 */
function updateRing(circleId, value, target, valueId, unit) {
  const circle = document.getElementById(circleId);
  const circumference = 2 * Math.PI * 52; // r=52
  const ratio = target > 0 ? Math.min(value / target, 1) : 0;
  const offset = circumference * (1 - ratio);

  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = offset;

  // 超出目标时变红
  if (value > target && target > 0) {
    circle.classList.add('over-target');
  } else {
    circle.classList.remove('over-target');
  }

  document.getElementById(valueId).textContent = Math.round(value);
}

function generateDashboardSuggestion(cals, pro, carbs, fat, goals) {
  const container = document.getElementById('dashboardSuggestion');
  const calsPct = goals.calories > 0 ? Math.round((cals / goals.calories) * 100) : 0;
  const proPct = goals.protein > 0 ? Math.round((pro / goals.protein) * 100) : 0;

  const suggestions = [];

  if (cals === 0 && pro === 0) {
    suggestions.push('今天还没有记录饮食，快去吃一顿健康美餐吧！');
  } else {
    if (calsPct >= 90) {
      suggestions.push('您今日热量摄入已接近目标，晚餐建议清淡些哦。');
    } else if (calsPct >= 60) {
      suggestions.push('热量摄入进度不错，继续保持均衡饮食！');
    }

    if (proPct < 50) {
      suggestions.push('蛋白质摄入偏少，建议多吃鸡胸肉、鱼、豆腐或鸡蛋。');
    } else if (proPct > 100) {
      suggestions.push('蛋白质摄入已超过目标，很棒！不再需要额外补充。');
    }

    const carbFatRatio = fat > 0 ? carbs / fat : 999;
    if (carbFatRatio < 2 && fat > 0) {
      suggestions.push('脂肪占比较高，可以减少油炸食物和动物脂肪的摄入。');
    }

    if (pro > 0 && carbs > 0 && cals < goals.calories * 0.4) {
      suggestions.push('目前热量偏低，下一餐可以加一些全谷物主食。');
    }
  }

  if (suggestions.length === 0) {
    suggestions.push('营养摄入均衡，继续保持！💪');
  }

  container.innerHTML = suggestions.map(s => `<p>💡 ${s}</p>`).join('');
}

// ============================================================
// 历史记录
// ============================================================

function initHistory() {
  document.getElementById('viewWeek').addEventListener('click', () => {
    STATE.historyView = 7;
    document.getElementById('viewWeek').classList.add('active');
    document.getElementById('viewMonth').classList.remove('active');
    refreshHistory();
    drawTrendChart();
  });

  document.getElementById('viewMonth').addEventListener('click', () => {
    STATE.historyView = 30;
    document.getElementById('viewMonth').classList.add('active');
    document.getElementById('viewWeek').classList.remove('active');
    refreshHistory();
    drawTrendChart();
  });
}

function refreshHistory() {
  const days = STATE.historyView;
  const today = new Date();
  const dates = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const allMeals = loadMeals();
  const container = document.getElementById('historyList');

  const html = dates.map(date => {
    const dayMeals = allMeals.filter(m => m.date === date);
    if (dayMeals.length === 0) {
      return `
        <div class="history-day">
          <div class="history-day-header">
            <span class="history-date">${formatDate(date)}</span>
            <span class="history-empty">无记录</span>
          </div>
        </div>
      `;
    }

    const cals = dayMeals.reduce((s, m) => s + m.calories, 0);
    const pro = dayMeals.reduce((s, m) => s + m.protein, 0);
    const carbs = dayMeals.reduce((s, m) => s + m.carbs, 0);
    const fat = dayMeals.reduce((s, m) => s + m.fat, 0);

    const mealNames = dayMeals.map(m => m.name).join('、');

    return `
      <div class="history-day">
        <div class="history-day-header">
          <span class="history-date">${formatDate(date)}</span>
          <span class="history-cals">🔥 ${cals} kcal</span>
        </div>
        <div class="history-day-stats">
          <span>🥩 ${pro.toFixed(1)}g</span>
          <span>🍚 ${carbs.toFixed(1)}g</span>
          <span>🥑 ${fat.toFixed(1)}g</span>
        </div>
        <div class="history-foods">${mealNames}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = html || '<p class="empty-state">暂无历史记录</p>';
}

function drawTrendChart() {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const width = rect.width;
  const height = 220;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.scale(dpr, dpr);

  // 清空
  ctx.clearRect(0, 0, width, height);

  const days = STATE.historyView;
  const today = new Date();
  const dates = [];
  const data = { calories: [], protein: [], carbs: [], fat: [] };

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    dates.push(formatDateShort(dateStr));

    const dayMeals = getMealsByDateRange(dateStr, dateStr);
    data.calories.push(dayMeals.reduce((s, m) => s + m.calories, 0));
    data.protein.push(dayMeals.reduce((s, m) => s + m.protein, 0));
    data.carbs.push(dayMeals.reduce((s, m) => s + m.carbs, 0));
    data.fat.push(dayMeals.reduce((s, m) => s + m.fat, 0));
  }

  // 边距
  const margin = { top: 20, right: 20, bottom: 40, left: 45 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  // 背景网格
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border-color') || '#e5e7eb';
  ctx.lineWidth = 0.5;

  // 热量最大值(用于缩放)、蛋白质/碳水/脂肪统一使用一个次轴
  const allVals = [...data.calories, ...data.protein, ...data.carbs, ...data.fat];
  const maxCal = Math.max(...data.calories, 100);
  const maxMacro = Math.max(...data.protein, ...data.carbs, ...data.fat, 50);

  // 网格线
  for (let i = 0; i <= 4; i++) {
    const y = margin.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();

    // Y轴标签（热量）
    const val = Math.round(maxCal - (maxCal / 4) * i);
    ctx.fillStyle = '#f59e0b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val, margin.left - 5, y + 3);
  }

  // 绘制折线
  const series = [
    { key: 'calories', color: '#f59e0b', max: maxCal },
    { key: 'protein', color: '#10b981', max: maxMacro },
    { key: 'carbs', color: '#6366f1', max: maxMacro },
    { key: 'fat', color: '#ef4444', max: maxMacro },
  ];

  series.forEach(({ key, color, max }) => {
    const values = data[key];
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    values.forEach((val, i) => {
      const x = margin.left + (chartW / (days - 1 || 1)) * i;
      const y = margin.top + chartH - (val / max) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 数据点
    values.forEach((val, i) => {
      const x = margin.left + (chartW / (days - 1 || 1)) * i;
      const y = margin.top + chartH - (val / max) * chartH;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // X轴标签
  ctx.fillStyle = '#6b7280';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  const step = days > 7 ? Math.floor(days / 7) : 1;
  dates.forEach((d, i) => {
    if (i % step === 0 || i === days - 1) {
      const x = margin.left + (chartW / (days - 1 || 1)) * i;
      ctx.fillText(d, x, height - 10);
    }
  });
}

// ============================================================
// 目标设定
// ============================================================

function initGoals() {
  document.getElementById('btnSaveGoals').addEventListener('click', saveGoalSettings);

  // 输入变化时实时更新进度
  const goalInputs = ['goalCalories', 'goalProtein', 'goalCarbs', 'goalFat'];
  goalInputs.forEach(id => {
    document.getElementById(id).addEventListener('input', refreshGoals);
  });
}

function saveGoalSettings() {
  const goals = {
    calories: parseInt(document.getElementById('goalCalories').value) || DEFAULT_GOALS.calories,
    protein: parseInt(document.getElementById('goalProtein').value) || DEFAULT_GOALS.protein,
    carbs: parseInt(document.getElementById('goalCarbs').value) || DEFAULT_GOALS.carbs,
    fat: parseInt(document.getElementById('goalFat').value) || DEFAULT_GOALS.fat,
  };

  saveGoals(goals);
  showToast('目标已保存！✅');
  refreshGoals();
  if (STATE.currentTab === 'dashboard') refreshDashboard();
}

function refreshGoals() {
  const goals = {
    calories: parseInt(document.getElementById('goalCalories').value) || DEFAULT_GOALS.calories,
    protein: parseInt(document.getElementById('goalProtein').value) || DEFAULT_GOALS.protein,
    carbs: parseInt(document.getElementById('goalCarbs').value) || DEFAULT_GOALS.carbs,
    fat: parseInt(document.getElementById('goalFat').value) || DEFAULT_GOALS.fat,
  };

  const todayMeals = getTodayMeals();
  let totalCals = 0, totalPro = 0, totalCarbs = 0, totalFat = 0;
  todayMeals.forEach(m => {
    totalCals += m.calories;
    totalPro += m.protein;
    totalCarbs += m.carbs;
    totalFat += m.fat;
  });

  // 更新进度条
  updateProgress('progCal', totalCals, goals.calories, 'kcal');
  updateProgress('progPro', totalPro, goals.protein, 'g');
  updateProgress('progCarb', totalCarbs, goals.carbs, 'g');
  updateProgress('progFat', totalFat, goals.fat, 'g');

  // AI建议
  generateGoalSuggestion(totalCals, totalPro, totalCarbs, totalFat, goals);
}

function updateProgress(prefix, value, target, unit) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  document.getElementById(`${prefix}Fill`).style.width = pct + '%';

  const overClass = value > target && target > 0 ? 'over-target' : '';
  const fillEl = document.getElementById(`${prefix}Fill`);
  fillEl.className = `progress-fill ${prefix === 'progCal' ? 'fill-calories' : prefix === 'progPro' ? 'fill-protein' : prefix === 'progCarb' ? 'fill-carbs' : 'fill-fat'} ${overClass}`;

  document.getElementById(`${prefix}Text`).textContent =
    `${Math.round(value)} / ${target} ${unit}`;
}

function generateGoalSuggestion(cals, pro, carbs, fat, goals) {
  const container = document.getElementById('goalSuggestion');
  const calsPct = goals.calories > 0 ? Math.round((cals / goals.calories) * 100) : 0;

  const suggestions = [];

  if (cals === 0) {
    suggestions.push('今天还没有记录饮食。开始记录每一餐，AI会为你提供个性化建议！');
  } else {
    if (calsPct < 50) {
      suggestions.push('热量摄入偏低，建议适当增加优质碳水和蛋白质的摄入。');
    } else if (calsPct >= 90 && calsPct <= 100) {
      suggestions.push('热量摄入接近目标，完美！保持这个节奏。');
    } else if (calsPct > 100) {
      suggestions.push('今日热量已超目标，下一餐可以选择蔬菜和鱼类，控制油脂摄入。');
    }

    // 蛋白质比例建议
    const proteinCalPct = cals > 0 ? Math.round((pro * 4 / cals) * 100) : 0;
    if (proteinCalPct < 15) {
      suggestions.push('蛋白质供能占比偏低(推荐15-35%)，建议补充瘦肉、鱼、蛋或豆制品。');
    } else if (proteinCalPct > 35) {
      suggestions.push('蛋白质供能占比较高，可以适当增加碳水的摄入以平衡营养。');
    }

    // 纤维建议
    const todayMeals = getTodayMeals();
    const hasVegetables = todayMeals.some(m => m.category === '蔬菜类');
    if (!hasVegetables && cals > 0) {
      suggestions.push('今天还没有吃蔬菜！蔬菜富含膳食纤维和微量元素，建议每餐都来一份。');
    }
  }

  if (suggestions.length === 0) {
    suggestions.push('饮食结构合理，继续保持健康习惯！🌟');
  }

  container.innerHTML = suggestions.map(s => `<p>💡 ${s}</p>`).join('');
}

// ============================================================
// 食物数据加载
// ============================================================

async function loadFoodData() {
  try {
    const response = await fetch('food_data.json');
    if (!response.ok) throw new Error('Failed to load food data');
    STATE.foods = await response.json();
  } catch (err) {
    console.error('加载食物数据失败:', err);
    // 降级：使用空数组
    STATE.foods = [];
    showToast('食物数据加载失败，请刷新页面', 'error');
  }
}

// ============================================================
// 窗口resize处理（重绘趋势图）
// ============================================================

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function handleResize() {
  if (STATE.currentTab === 'history') {
    drawTrendChart();
  }
}

// ============================================================
// 初始化
// ============================================================

async function init() {
  // 主题
  initTheme();
  document.getElementById('themeToggle').addEventListener('click', handleThemeToggle);

  // Tab导航
  initTabs();

  // 加载数据
  await loadFoodData();

  // 加载目标设置
  const goals = loadGoals();
  document.getElementById('goalCalories').value = goals.calories;
  document.getElementById('goalProtein').value = goals.protein;
  document.getElementById('goalCarbs').value = goals.carbs;
  document.getElementById('goalFat').value = goals.fat;

  // 各个功能模块
  initFoodSearch();
  initFoodDetail();
  initTodayLog();
  initPhotoUpload();
  initDashboard();
  initHistory();
  initGoals();

  // 初始刷新
  refreshTodayLog();
  refreshGoals();

  // 窗口resize
  window.addEventListener('resize', debounce(handleResize, 250));
}

// 启动
document.addEventListener('DOMContentLoaded', init);
