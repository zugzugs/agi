async function loadArticles() {
  const container = document.getElementById('articles');

  try {
    const res = await fetch('outputs/');
    if (!res.ok) throw new Error(`Could not load outputs directory (${res.status})`);
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const links = Array.from(doc.querySelectorAll('a'))
      .map(a => a.getAttribute('href'))
      .filter(href => href.endsWith('.json'));

    for (let href of links.reverse()) {
      const jsonRes = await fetch('outputs/' + href);
      const data = await jsonRes.json();
      renderArticle(data, container);
    }
  } catch (err) {
    container.innerHTML = `<p class="text-red-600">Error loading articles: ${err}</p>`;
  }
}

function renderArticle(data, container) {
  const article = document.createElement('div');
  article.className = 'bg-white shadow rounded-2xl p-6';

  const title = data.response_parsed?.title || data.topic;
  const summary = data.response_parsed?.summary || '';
  const keyPoints = data.response_parsed?.key_points || [];
  const codeExamples = data.response_parsed?.code_examples || [];
  const versionNotes = data.response_parsed?.version_notes || [];
  const caveats = data.response_parsed?.caveats || [];

  article.innerHTML = `
    <h2 class="text-2xl font-semibold mb-2">${title}</h2>
    <p class="mb-4">${summary}</p>
    <h3 class="text-xl font-medium mt-4 mb-2">Key Points</h3>
    <ul class="list-disc ml-6 space-y-1">${keyPoints.map(p => `<li>${p}</li>`).join('')}</ul>
    <h3 class="text-xl font-medium mt-4 mb-2">Code Examples</h3>
    ${codeExamples.map(ex => `<pre class="bg-gray-100 p-2 rounded"><code>${ex.code}</code></pre>`).join('')}
    <h3 class="text-xl font-medium mt-4 mb-2">Version Notes</h3>
    <ul class="list-disc ml-6 space-y-1">${versionNotes.map(p => `<li>${p}</li>`).join('')}</ul>
    <h3 class="text-xl font-medium mt-4 mb-2">Caveats</h3>
    <ul class="list-disc ml-6 space-y-1">${caveats.map(p => `<li>${p}</li>`).join('')}</ul>
    <p class="text-sm text-gray-500 mt-4">Model: ${data.model} • ${data.timestamp_utc}</p>
  `;

  container.appendChild(article);
}

loadArticles();
