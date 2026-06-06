
async function test() {
  try {
    const response = await fetch('http://localhost:3000/api/health');
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Body:', text);
  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();
