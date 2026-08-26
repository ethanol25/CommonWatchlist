document.getElementById('compareBtn').addEventListener('click', async () => {
  const rawInput = document.getElementById('usernames').value;
  const statusEl = document.getElementById('status');
  const resultsContainer = document.getElementById('resultsContainer');
  const matchList = document.getElementById('matchList');
  const matchCount = document.getElementById('matchCount');

  // Parse and normalize input usernames
  const usernames = rawInput
    .split(/[\n,]+/)
    .map(u => u.trim())
    .filter(u => u.length > 0);

  const uniqueUsernames = [...new Set(usernames)];

  if (uniqueUsernames.length < 2) {
    statusEl.textContent = 'Please enter at least two distinct usernames.';
    return;
  }

  if (uniqueUsernames.length > 20) {
    statusEl.textContent = 'Please limit input to a maximum of 20 usernames.';
    return;
  }

  resultsContainer.style.display = 'none';
  matchList.innerHTML = '';
  console.log(`[UI] Initiated frequency analysis for:`, uniqueUsernames);

  try {
    const responses = [];
    const chunkSize = 4;
    const totalUsers = uniqueUsernames.length;

    for (let i = 0; i < uniqueUsernames.length; i += chunkSize) {
      const chunk = uniqueUsernames.slice(i, i + chunkSize);
      statusEl.innerHTML = `Scraping batch ${Math.ceil((i + 1) / chunkSize)} of ${Math.ceil(uniqueUsernames.length / chunkSize)}...`;
      
      const chunkPromises = chunk.map(user => 
        fetch(`/api/watchlist/${user}`).then(r => r.json()).then(data => ({ username: user, data }))
      );
      
      const chunkResponses = await Promise.all(chunkPromises);
      responses.push(...chunkResponses);
    }

    const failedRequests = responses.filter(res => !res.data.success);
    if (failedRequests.length > 0) {
      console.error('[Error] Failed requests:', failedRequests);
      throw new Error(`Failed to scrape ${failedRequests.length} watchlist(s).`);
    }

    //Frequency Map
    const frequencyMap = {};

    responses.forEach(res => {
      const user = res.username;
      const items = res.data.items;

      items.forEach(item => {
        if (!frequencyMap[item]) {
          frequencyMap[item] = {
            count: 0,
            users: []
          };
        }
        frequencyMap[item].count += 1;
        frequencyMap[item].users.push(user);
      });
    });

    const rankedItems = Object.entries(frequencyMap)
      .map(([itemName, details]) => {
        const matchPercentage = (details.count / totalUsers) * 100;
        return { name: itemName, matchPercentage, ...details };
      })
      // Keeps only items that appear in 50% or more of the watchlists
      .filter(item => item.matchPercentage >= 50)
      .sort((a, b) => b.count - a.count);

    console.log(`[Logic] Sorted ${rankedItems.length} items with overlapping matches.`);

    // Update UI 
    statusEl.textContent = `Analysis complete for ${uniqueUsernames.length} users.`;
    matchCount.textContent = rankedItems.length;
    
    rankedItems.forEach(item => {
      const li = document.createElement('li');
      li.style.marginBottom = '0.75rem';
      
      // Inline structure formatting: Item Name (Match Count/Total) - User list
      li.innerHTML = `
        <strong>${item.name}</strong> 
        <small style="color: #666;">
          (Matched ${item.count}/${uniqueUsernames.length})
        </small>
        <br>
        <span style="font-size: 0.85rem; color: #444;">
          In watchlists of: ${item.users.join(', ')}
        </span>
      `;
      matchList.appendChild(li);
    });

    resultsContainer.style.display = 'block';

  } catch (error) {
    console.error('[System Error]', error);
    statusEl.textContent = `An error occurred: ${error.message}`;
  }
});