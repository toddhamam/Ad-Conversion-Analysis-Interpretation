// Quick token validation test
const ACCESS_TOKEN = 'EAAcQgZALr5sABQYAFJoK8nKmce7PmA3lXRFWWUz1qlUkDjROE3ZBJFCSViEOd5HDnvOXs5nnk1rpblFoSBze94Tt4ZCYuZAZBbzGliZC1wC3qnhRmQG9Q3DntZAFTElnI1TZAxyOV6bSTUnpVujp1r4ZB8GuKNrwnatIjb9AyioETJkKZCV8p3VDjYTqxoaVvQABX3Myw0jkS0y4JOAPBe8L2igFOj0hPesGLe3sTNLXFTRBCbNWav5JZCvZCAZDZD';
const AD_ACCOUNT_ID = 'act_998694289081563';

async function testToken() {
  console.log('\n🧪 Testing Meta Access Token...');
  console.log('Token (first 30 chars):', ACCESS_TOKEN.substring(0, 30) + '...');
  console.log('Ad Account ID:', AD_ACCOUNT_ID);

  try {
    // Test 1: Debug token to check validity
    const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${ACCESS_TOKEN}&access_token=${ACCESS_TOKEN}`;
    console.log('\n📋 Step 1: Checking token validity...');
    const debugResponse = await fetch(debugUrl);
    const debugData = await debugResponse.json();

    console.log('Debug response:', JSON.stringify(debugData, null, 2));

    if (debugData.error) {
      console.error('\n❌ Token is INVALID:', debugData.error.message);
      console.log('\n💡 Solution: Generate a new token at:');
      console.log('   https://developers.facebook.com/tools/explorer/');
      console.log('   Make sure to select your app and grant these permissions:');
      console.log('   - ads_read');
      console.log('   - ads_management');
      console.log('   - business_management');
      return;
    }

    console.log('\n✅ Token is valid!');
    console.log('App ID:', debugData.data?.app_id);
    console.log('Expires:', debugData.data?.expires_at);

    // Test 2: Try to access ad account
    const accountUrl = `https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}?access_token=${ACCESS_TOKEN}&fields=name,account_id,account_status`;
    console.log('\n📋 Step 2: Testing ad account access...');
    const accountResponse = await fetch(accountUrl);
    const accountData = await accountResponse.json();

    if (accountData.error) {
      console.error('\n❌ Ad Account Error:', accountData.error.message);
      console.log('Error code:', accountData.error.code);
      console.log('Error type:', accountData.error.type);
      return;
    }

    console.log('\n✅ Ad Account accessible!');
    console.log('Account:', accountData.name);
    console.log('Status:', accountData.account_status);

    console.log('\n🎉 All tests passed! Token is working correctly.');

  } catch (error) {
    console.error('\n❌ Network error:', error.message);
  }
}

testToken();
