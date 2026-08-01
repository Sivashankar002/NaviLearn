const path = require('path');
// Add server's node_modules to the module lookup path
module.paths.push(path.resolve(__dirname, '../server/node_modules'));

const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: path.resolve(__dirname, '../server/.env') });

async function testGemini35() {
  const key = process.env.GEMINI_API_KEY;
  console.log('Using Key:', key ? `${key.substring(0, 8)}...` : 'undefined');
  if (!key) {
    console.error('No GEMINI_API_KEY found in server/.env');
    return;
  }
  
  const genAI = new GoogleGenerativeAI(key);
  const modelName = 'gemini-3.5-flash';
  
  console.log(`\n--- Test 1: Basic Generation with ${modelName} ---`);
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent('Verify you are working by saying: "Gemini 3.5 Flash is operational!"');
    console.log('Response:', result.response.text().trim());
  } catch (err) {
    console.error(`Error in Test 1:`, err.message || err);
    return;
  }
  
  console.log(`\n--- Test 2: Structured JSON Output with ${modelName} ---`);
  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });
    
    const samplePrompt = `
    Respond with a JSON object following this schema:
    {
      "testPassed": boolean,
      "message": "string"
    }
    `;
    
    const result = await model.generateContent(samplePrompt);
    const text = result.response.text().trim();
    console.log('Raw JSON Response:', text);
    
    const parsed = JSON.parse(text);
    console.log('Parsed successfully:', parsed);
    if (parsed.testPassed === true || parsed.testPassed === 'true' || parsed.message) {
      console.log('\n✅ gemini-3.5-flash is fully operational and fine to use!');
    } else {
      console.log('\n⚠️ JSON output worked, but response check failed:', parsed);
    }
  } catch (err) {
    console.error(`Error in Test 2 (JSON):`, err.message || err);
  }
}

testGemini35();
