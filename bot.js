// bot.js
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // your bot's application ID
const GUILD_ID = process.env.GUILD_ID;   // your server ID (for guild-only registration)

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Slash commands (only register these once)
const commands = [
  new SlashCommandBuilder()
    .setName('grant')
    .setDescription('Grant a system clearance role to a user.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to give clearance to')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Role to grant')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('revoke')
    .setDescription('Revoke a system clearance role from a user.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to revoke clearance from')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Role to revoke')
        .setRequired(true))
].map(cmd => cmd.toJSON());

// Clearance levels
const clearanceLevels = {
  "OS": "Level 5 System Access | Overseer System ",
  "DA": "Level 4 System Access | Director Access ",
  "CA": "Level 3 System Access | Command Access ",
  "SA": "Level 2 System Access | Security Access ",
  "RA": "Level 1 System Access | Restricted Access ",
  "LA": "Level 0 System Access | Limited Access ",
  "XA": "Level ∅ System Access | Experimental Access ",
  "AA": "Level Authorized Access | Automated Access ",
};

// Hierarchy
const clearanceOrder = ['OS', 'DA', 'CA', 'SA', 'RA', 'LA', 'XA', 'AA'];

// Delay helper
const delay = ms => new Promise(res => setTimeout(res, ms));

// Letter typing function (unchanged)
async function typeLine(interaction, text, prev = "", totalTime = 300) {
  const perChar = totalTime / Math.max(text.length, 1);
  let output = prev;
  for (const char of text) {
    output += char;
    await interaction.editReply("```ansi\n\u001b[0;32m" + output + "\n```");
    await delay(perChar);
  }
  return output + "\n";
}

// Register commands when bot starts (only once)
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('🔄 Registering guild commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Guild slash commands registered successfully.');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
  }
});

// Handle commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply({ ephemeral: false });

  const targetUser = interaction.options.getUser('user');
  const targetRole = interaction.options.getRole('role');
  const executor = interaction.member;
  const botMember = await interaction.guild.members.fetchMe();

  const highestExecutorRole = executor.roles.cache
    .map(r => r.name.split(' ')[0])
    .filter(tok => clearanceOrder.includes(tok))
    .sort((a, b) => {
      const ra = executor.roles.cache.find(rr => rr.name.startsWith(a + ' ')) || executor.roles.cache.find(rr => rr.name === a);
      const rb = executor.roles.cache.find(rr => rr.name.startsWith(b + ' ')) || executor.roles.cache.find(rr => rr.name === b);
      return (rb?.position || 0) - (ra?.position || 0);
    })[0] || 'UN';

  const targetAbbrev = targetRole.name.split(' ')[0];
  const levelDescription = clearanceLevels[targetAbbrev] || targetRole.name;

  // Permission checks
  if (!executor.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return interaction.editReply({ content: '⚠️ You lack permission.' });
  }
  if (targetRole.position >= botMember.roles.highest.position) {
    return interaction.editReply({ content: '⚠️ I cannot modify that role; it is higher than my top role.' });
  }

  try {
    const member = await interaction.guild.members.fetch(targetUser.id);

    if (interaction.commandName === 'grant') {
      await member.roles.add(targetRole);
      await interaction.editReply({
        content: `${highestExecutorRole} has authorized ${levelDescription} [<@&${targetRole.id}>] for <@${targetUser.id}>.\n\n` +
                 "```ansi\n\u001b[0;32mAuthorization logged.\n```",
        allowedMentions: { users: [targetUser.id], roles: [targetRole.id] }
      });
    }

    if (interaction.commandName === 'revoke') {
      await member.roles.remove(targetRole);
      await interaction.editReply({
        content: `${highestExecutorRole} has revoked ${levelDescription} [<@&${targetRole.id}>] from <@${targetUser.id}>.\n\n` +
                 "```ansi\n\u001b[0;31mRevocation logged.\n```",
        allowedMentions: { users: [targetUser.id], roles: [targetRole.id] }
      });
    }
  } catch (err) {
    console.error(err);
    await interaction.editReply({ content: '⚠️ I lack permission to modify that role.' });
  }
});

client.login(TOKEN);