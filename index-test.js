const { startBot } = require('./bot/bot');

// Initialize the WhatsApp bot (No Firebase version for testing)
async function main() {
  try {
    console.log('🚀 Starting Study Planner Bot (No Firebase Mode)...');
    await startBot();
    console.log('✅ Study Planner Bot is running!');
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