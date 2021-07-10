require('dotenv').config();
const { Client, MessageEmbed } = require('discord.js');
const { spawn } = require('child_process');
const getUUID = require('minecraft-uuid-cache');

var client = new Client();

var mcChannel = null;
var mcLoaded = false;

// Start the minceraft server
var mcServer = spawn('java -Xmx3G -Xms3G -jar *.jar nogui', {
	stdio: [null, null, null],
	shell: true,
});

// Transmit to Discord
mcServer.stdout.on('data', (data) => {
	process.stdout.write((data = data.toString()));

	if (!mcChannel) return;

	// Prune timestamp
	data = data.substring(data.indexOf(']') + 2);
	var dataType = data.substring(0, data.indexOf(':'));
	var dataContent = data.substring(data.indexOf(':') + 2);

	// We only care about server info that has this type
	if (!dataType.includes('[Server thread/INFO]')) return;

	if (!mcLoaded) return (mcLoaded = dataContent.startsWith('Done'));

	// Empty server
	if (dataContent.startsWith('No player was found')) return;

	// This indicates a system message for audit purposes afaict
	if (dataContent.charAt(0) == '[') return;

	// These are always chat messages sent by players always send these to discord
	if (dataContent.charAt(0) == '<') {
		let username = dataContent.substring(1, dataContent.indexOf('>'));
		return getUUID(username).then((uuid) => {
			return mcChannel.send(
				new MessageEmbed()
					.setColor('#aa00aa')
					.setAuthor(
						username,
						`https://crafatar.com/avatars/${uuid}?size=128&default=MHF_Steve&overlay`,
						`https://crafatar.com/avatars/${uuid}?size=128&default=MHF_Steve&overlay`
					)
					.setDescription(dataContent.substring(dataContent.indexOf(' ') + 1))
			);
		});
	}

	// Ignore system messages about logging in and out
	if (dataContent.includes('logged in with entity id') || dataContent.includes('lost connection:')) return;

	// Ignore death messages for things like villagers
	if (dataContent.includes('ServerLevel[')) return;

	// Everything else should be a message seen by players
	return mcChannel.send(new MessageEmbed().setColor('#00aa00').setDescription(dataContent));
});

// Terminate app once server closes
mcServer.on('exit', () => {
	// Tell discord the server stopped
	mcChannel.send(new MessageEmbed().setColor('#aa0000').setDescription('The server stopped... Someone tell someone'));
	setTimeout(() => {
		process.exit(1);
	}, 2000);
});

// Toss commandline input to the server
process.stdin.on('data', (data) => {
	if (data.toString().includes('stop')) mcLoaded = false;

	mcServer.stdin.write(data);
});

// Transmit to MineCraft
client.on('message', async (message) => {
	// Ignore bot messages
	if (message.author.bot) return;

	if (message.channel == mcChannel) {
		mcServer.stdin.write(
			'/tellraw @a ["",{"text":"[Discord]","color":"dark_purple"}," <' +
				message.author.username +
				'> ","' +
				message.cleanContent +
				'"]\n'
		);
	}
});

client.on('ready', () => {
	console.log(`${client.user.tag} is ready`);
	mcChannel = client.channels.cache.get(process.env.CHANNEL_ID);
	console.log('Starting minecraft server...');
});
client.login(process.env.API_KEY);
