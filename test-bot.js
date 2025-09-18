const { startBot } = require('./bot/bot-test');

// Initialize the WhatsApp bot (Test Mode)
async function main() {
  try {
    console.log('🚀 Starting Study Planner Bot (Test Mode)...');
    console.log('📱 This will show a QR code to connect to WhatsApp');
    console.log('🔧 No Firebase required for basic testing');
    console.log('');
    
    await startBot();
    console.log('✅ Study Planner Bot is running in test mode!');
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Study Planner Bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down Study Planner Bot...');
  process.exit(0);
});

main().catch(console.error);