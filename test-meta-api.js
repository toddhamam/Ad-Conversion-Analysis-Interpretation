// Test Meta API connection
const ACCESS_TOKEN = 'EAAcQgZALr5sABQVScilG07PfdDhHZCfILmLHIMkX2Uu9D7dsSww2dLVsb8cUPgW4uiQIN3HKWEuOuDmSbQpzUNjngNFi1RYhbMRRQrDGZCjQtaHcTnhZBz9kcjEbxmEJrD1vrAEVNRvxTvck1NvZAeHZB4eFWhrVa1rWCMAFgDMacIfFiFqtbelJLCDacd7ov7YmTxeACZBNWKr95hicab4LOWRUbxekH0ZAPc5zYWn8PealaZBFN3yfZCEPfUV1mjXh0uPMptoaeiRZB9i7BZBclsoFauADfjDWZCnybuZCO3NQZDZD';
const AD_ACCOUNT_ID = 'act_998694289081563';

async function testConnection() {
  console.log('Testing Meta API connection...');
  console.log('Ad Account ID:', AD_ACCOUNT_ID);

  try {
    // Test 1: Get ad account info
    const accountUrl = `https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}?access_token=${ACCESS_TOKEN}&fields=name,account_id`;
    console.log('\n1. Testing ad account access...');
    const accountResponse = await fetch(accountUrl);
    const accountData = await accountResponse.json();

    if (accountData.error) {
      console.error('❌ Ad Account Error:', accountData.error);
      return;
    }
    console.log('✅ Ad Account:', accountData);

    // Test 2: Get insights
    const insightsUrl = `https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}/insights?access_token=${ACCESS_TOKEN}&fields=campaign_name,impressions,clicks,spend&level=campaign&time_range={"since":"2024-01-01","until":"2026-01-11"}&limit=5`;
    console.log('\n2. Testing insights API...');
    const insightsResponse = await fetch(insightsUrl);
    const insightsData = await insightsResponse.json();

    if (insightsData.error) {
      console.error('❌ Insights Error:', insightsData.error);
      return;
    }
    console.log('✅ Insights Data:', JSON.stringify(insightsData, null, 2));

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testConnection();
