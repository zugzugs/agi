// Global state
let allArticles = [];
let filteredArticles = [];
let currentSort = 'newest';
let isDarkMode = localStorage.getItem('darkMode') === 'true';

// DOM elements
const elements = {
  articles: () => document.getElementById('articles'),
  loading: () => document.getElementById('loading'),
  searchInput: () => document.getElementById('search-input'),
  sortNewest: () => document.getElementById('sort-newest'),
  sortOldest: () => document.getElementById('sort-oldest'),
  generateNew: () => document.getElementById('generate-new'),
  articleCount: () => document.getElementById('article-count'),
  lastUpdatedTime: () => document.getElementById('last-updated-time'),
  noResults: () => document.getElementById('no-results'),
  darkModeToggle: () => document.getElementById('dark-mode-toggle')
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  loadArticles();
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  elements.searchInput().addEventListener('input', debounce(handleSearch, 300));
  elements.sortNewest().addEventListener('click', () => setSort('newest'));
  elements.sortOldest().addEventListener('click', () => setSort('oldest'));
  elements.generateNew().addEventListener('click', generateNewArticle);
}

// Debounce function for search
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Load articles from JSON files
async function loadArticles() {
  const container = elements.articles();
  const loading = elements.loading();

  try {
    // List of output files we know exist
    const outputFiles = [
      '20250823T230352Z__000000000001_39a50abcc2.json',
      '20250824T012348Z__000000000002_2cc9f49594.json',
      '20250824T021801Z__000000000003_bbeeded2b0.json',
      '20250824T054704Z__000000000004_4710fdcaad.json',
      '20250824T065738Z__000000000005_fc4018092d.json',
      '20250824T103640Z__000000000006_d9557f1f98.json',
      '20250824T111326Z__000000000007_f9970b716c.json',
      '20250824T112828Z__000000000008_0fefbcc090.json',
      '20250824T130415Z__000000000009_b3c873ed75.json',
      '20250824T134646Z__000000000010_cae48ad4be.json',
      '20250824T144554Z__000000000011_582ac70ced.json',
      '20250824T192746Z__000000000012_60ffc87e4e.json',
      '20250824T195606Z__000000000013_5f8137974c.json'
    ];

    // Load articles in parallel
    const articlePromises = outputFiles.map(async (filename) => {
      try {
        const jsonRes = await fetch('outputs/' + filename);
        if (!jsonRes.ok) {
          console.warn(`Could not load ${filename}: ${jsonRes.status}`);
          return null;
        }
        const data = await jsonRes.json();
        return {
          ...data,
          filename,
          searchText: generateSearchText(data)
        };
      } catch (err) {
        console.warn(`Error loading ${filename}:`, err);
        return null;
      }
    });

    const articles = (await Promise.all(articlePromises)).filter(Boolean);
    
    // Sort by timestamp (newest first)
    allArticles = articles.sort((a, b) => new Date(b.timestamp_utc) - new Date(a.timestamp_utc));
    filteredArticles = [...allArticles];

    // Update UI
    updateArticleCount();
    updateLastUpdated();
    renderArticles();
    
    // Hide loading indicator
    if (loading) {
      loading.style.display = 'none';
    }

    if (allArticles.length === 0) {
      container.innerHTML = '<p class="text-gray-600">No articles found. Make sure the output files exist in the outputs/ directory.</p>';
    }
  } catch (err) {
    // Hide loading indicator on error
    if (loading) {
      loading.style.display = 'none';
    }
    container.innerHTML = `<p class="text-red-600">Error loading articles: ${err.message}</p>`;
  }
}

// Generate searchable text from article data
function generateSearchText(data) {
  const title = data.response_parsed?.title || data.topic || '';
  const summary = data.response_parsed?.summary || '';
  const keyPoints = (data.response_parsed?.key_points || []).join(' ');
  const codeExamples = (data.response_parsed?.code_examples || []).map(ex => ex.code || ex).join(' ');
  const versionNotes = (data.response_parsed?.version_notes || []).join(' ');
  const caveats = (data.response_parsed?.caveats || []).join(' ');
  
  return `${title} ${summary} ${keyPoints} ${codeExamples} ${versionNotes} ${caveats}`.toLowerCase();
}

// Handle search
function handleSearch() {
  const searchTerm = elements.searchInput().value.toLowerCase().trim();
  
  if (searchTerm === '') {
    filteredArticles = [...allArticles];
  } else {
    filteredArticles = allArticles.filter(article => 
      article.searchText.includes(searchTerm)
    );
  }
  
  renderArticles();
}

// Set sort order
function setSort(sortType) {
  currentSort = sortType;
  
  // Update button styles
  if (sortType === 'newest') {
    elements.sortNewest().className = 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors';
    elements.sortOldest().className = 'px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors';
  } else {
    elements.sortNewest().className = 'px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors';
    elements.sortOldest().className = 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors';
  }
  
  renderArticles();
}

// Render articles
function renderArticles() {
  const container = elements.articles();
  const noResults = elements.noResults();
  
  // Sort articles
  const sortedArticles = [...filteredArticles];
  if (currentSort === 'newest') {
    sortedArticles.sort((a, b) => new Date(b.timestamp_utc) - new Date(a.timestamp_utc));
  } else {
    sortedArticles.sort((a, b) => new Date(a.timestamp_utc) - new Date(b.timestamp_utc));
  }
  
  // Clear container
  container.innerHTML = '';
  
  if (sortedArticles.length === 0) {
    noResults.classList.remove('hidden');
    return;
  }
  
  noResults.classList.add('hidden');
  
  // Render each article
  sortedArticles.forEach(article => {
    renderArticle(article, container);
  });
}

// Render individual article
function renderArticle(data, container) {
  const article = document.createElement('div');
  article.className = 'bg-white shadow-lg rounded-xl p-6 border border-gray-200 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1';

  const title = data.response_parsed?.title || data.topic || 'Untitled Article';
  const summary = data.response_parsed?.summary || 'No summary available';
  const keyPoints = data.response_parsed?.key_points || [];
  const codeExamples = data.response_parsed?.code_examples || [];
  const versionNotes = data.response_parsed?.version_notes || [];
  const caveats = data.response_parsed?.caveats || [];

  // Format timestamp
  const timestamp = new Date(data.timestamp_utc);
  const formattedDate = timestamp.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let sections = '';
  
  if (keyPoints.length > 0) {
    sections += `
      <div class="mt-6">
        <h3 class="text-xl font-semibold mb-3 text-gray-800 flex items-center">
          <i class="fas fa-key text-blue-600 mr-2"></i>Key Points
        </h3>
        <ul class="list-disc ml-6 space-y-2 text-gray-700">${keyPoints.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>
    `;
  }

  if (codeExamples.length > 0) {
    sections += `
      <div class="mt-6">
        <h3 class="text-xl font-semibold mb-3 text-gray-800 flex items-center">
          <i class="fas fa-code text-green-600 mr-2"></i>Code Examples
        </h3>
        <div class="space-y-3">
          ${codeExamples.map((ex, index) => `
            <div class="bg-gray-50 p-4 rounded-lg border">
              ${ex.language ? `<div class="text-sm font-medium text-gray-600 mb-2">${ex.language}</div>` : ''}
              <pre class="bg-gray-100 p-3 rounded text-sm overflow-x-auto"><code>${ex.code || ex}</code></pre>
              <button onclick="copyToClipboard(this, '${ex.code || ex}')" class="mt-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors">
                <i class="fas fa-copy mr-1"></i>Copy
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (versionNotes.length > 0) {
    sections += `
      <div class="mt-6">
        <h3 class="text-xl font-semibold mb-3 text-gray-800 flex items-center">
          <i class="fas fa-info-circle text-purple-600 mr-2"></i>Version Notes
        </h3>
        <ul class="list-disc ml-6 space-y-2 text-gray-700">${versionNotes.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>
    `;
  }

  if (caveats.length > 0) {
    sections += `
      <div class="mt-6">
        <h3 class="text-xl font-semibold mb-3 text-gray-800 flex items-center">
          <i class="fas fa-exclamation-triangle text-orange-600 mr-2"></i>Caveats
        </h3>
        <ul class="list-disc ml-6 space-y-2 text-gray-700">${caveats.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>
    `;
  }

  article.innerHTML = `
    <div class="flex justify-between items-start mb-4">
      <h2 class="text-2xl font-bold text-gray-900 flex-1">${title}</h2>
      <div class="flex gap-2 ml-4">
        <button onclick="toggleArticle(this)" class="text-gray-400 hover:text-gray-600 transition-colors">
          <i class="fas fa-chevron-up"></i>
        </button>
        <button onclick="shareArticle('${encodeURIComponent(JSON.stringify(data))}')" class="text-gray-400 hover:text-blue-600 transition-colors">
          <i class="fas fa-share"></i>
        </button>
      </div>
    </div>
    <p class="text-gray-700 leading-relaxed mb-4">${summary}</p>
    ${sections}
    <div class="mt-6 pt-4 border-t border-gray-200">
      <div class="flex justify-between items-center text-sm text-gray-500">
        <div>
          <span class="font-medium">Model:</span> ${data.model || 'Unknown'} • 
          <span class="font-medium">Generated:</span> ${formattedDate}
        </div>
        <div class="flex gap-2">
          <span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">${keyPoints.length} key points</span>
          <span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">${codeExamples.length} examples</span>
        </div>
      </div>
    </div>
  `;

  container.appendChild(article);
}

// Update article count
function updateArticleCount() {
  const count = allArticles.length;
  elements.articleCount().textContent = `${count} article${count !== 1 ? 's' : ''}`;
}

// Update last updated time
function updateLastUpdated() {
  if (allArticles.length > 0) {
    const latest = allArticles[0];
    const timestamp = new Date(latest.timestamp_utc);
    const formattedDate = timestamp.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    elements.lastUpdatedTime().textContent = formattedDate;
  }
}

// Copy code to clipboard
function copyToClipboard(button, text) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-check mr-1"></i>Copied!';
    button.className = 'mt-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded transition-colors';
    
    setTimeout(() => {
      button.innerHTML = originalText;
      button.className = 'mt-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors';
    }, 2000);
  });
}

// Toggle article collapse/expand
function toggleArticle(button) {
  const article = button.closest('.bg-white');
  const content = article.querySelector('p, div[class*="mt-6"]');
  const icon = button.querySelector('i');
  
  if (content.style.display === 'none') {
    content.style.display = 'block';
    icon.className = 'fas fa-chevron-up';
  } else {
    content.style.display = 'none';
    icon.className = 'fas fa-chevron-down';
  }
}

// Share article
function shareArticle(data) {
  if (navigator.share) {
    navigator.share({
      title: 'Python 3.12+ Article',
      text: 'Check out this Python 3.12+ article from the Ollama Wiki!',
      url: window.location.href
    });
  } else {
    // Fallback: copy URL to clipboard
    navigator.clipboard.writeText(window.location.href).then(() => {
      alert('Article URL copied to clipboard!');
    });
  }
}

// Generate new article
async function generateNewArticle() {
  const button = elements.generateNew();
  const originalText = button.innerHTML;
  
  button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
  button.disabled = true;
  
  try {
    const response = await fetch('http://localhost:5000/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Reload articles after generation
      await loadArticles();
      showNotification('New article generated successfully!', 'success');
    } else {
      throw new Error(result.error || 'Failed to generate article');
    }
  } catch (error) {
    console.error('Error generating article:', error);
    showNotification('Failed to generate new article. Please make sure the API server is running.', 'error');
  } finally {
    button.innerHTML = originalText;
    button.disabled = false;
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 transition-all duration-300 transform translate-x-full`;
  
  const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
  notification.className += ` ${bgColor} text-white`;
  
  notification.innerHTML = `
    <div class="flex items-center">
      <i class="fas ${type === 'success' ? 'fa-check' : type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle'} mr-2"></i>
      <span>${message}</span>
      <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.classList.remove('translate-x-full');
  }, 100);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    notification.classList.add('translate-x-full');
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}
