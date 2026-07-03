/**
 * REST API client module for Personal Goals Tracker
 */

export async function fetchGoals() {
  try {
    const res = await fetch('/api/goals');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const result = await res.json();
    return result.data || [];
  } catch (err) {
    console.error('Failed to fetch goals:', err);
    throw err;
  }
}

export async function saveGoals(goalsTree) {
  try {
    const res = await fetch('/api/goals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(goalsTree)
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const result = await res.json();
    return result.data;
  } catch (err) {
    console.error('Failed to save goals:', err);
    throw err;
  }
}
