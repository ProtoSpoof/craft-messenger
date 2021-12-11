require('dotenv').config();
const { Client, MessageEmbed } = require('discord.js');
const { spawn, execSync } = require('child_process');
const getUUID = require('minecraft-uuid-cache');
var client = new Client();

var mcChatChannel = null;
var mcCommandsChannel = null;
var mcLoaded = false;

// Start the minceraft server
var mcServer = spawn('java -Xmx8G -Xms8G -jar *.jar nogui', {
	cwd: '../server/',
	stdio: [null, null, null],
	shell: true,
});

client.login(process.env.API_KEY);

let backup = () => {
	let now = new Date();
	let night = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 07, 0, 0);
	mcServer.stdin.write(
		'/tellraw @a ["",{"text":"[SERVER]","color":"green"},"A server backup is starting! Things might get a little laggy :)"]\n'
	);
	mcServer.stdin.write('/save-off\n');
	mcServer.stdin.write('/save-all\n');

	// Compress
	execSync(`zip -r ${now.toISOString()}.zip ../server/world/`, { cwd: '../backup/' });
	mcServer.stdin.write('/save-on\n');
	mcServer.stdin.write('/tellraw @a ["",{"text":"[SERVER]","color":"green"},"Backup Completed!"]\n');
	setTimeout(backup, night.getTime() - now.getTime());
};

setTimeout(backup, 300000);

// Transmit to Discord
mcServer.stdout.on('data', (data) => {
	process.stdout.write((data = data.toString()));

	if (!mcChatChannel && !mcCommandsChannel) return;

	// Prune timestamp
	data = data.substring(data.indexOf(']') + 2);
	let dataType = data.substring(0, data.indexOf(':'));
	let dataContent = data.substring(data.indexOf(':') + 2);

	// We only care about server info that has this type (generally)
	if (!dataType.includes('[Server thread/INFO]')) return;

	if (!mcLoaded) return (mcLoaded = dataContent.startsWith('Done'));

	if (isCommandChatData(dataContent))
		return mcCommandsChannel.send(new MessageEmbed().setColor('#0000aa').setDescription(dataContent));

	// These are always chat messages sent by players always send these to discord
	if (dataContent.charAt(0) == '<') {
		let username = dataContent.substring(1, dataContent.indexOf('>'));
		return getUUID(username).then((uuid) => {
			return mcChatChannel.send(
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

	// Everything else should be a message seen by players
	return mcChatChannel.send(new MessageEmbed().setColor('#00aa00').setDescription(dataContent));
});

// Terminate app once server closes
mcServer.on('exit', () => {
	// Tell discord the server stopped
	mcChatChannel.send(
		new MessageEmbed().setColor('#aa0000').setDescription('The server stopped... Someone tell someone')
	);
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

	if (message.channel == mcChatChannel) {
		handleChat(message);
	} else if (message.channel == mcCommandsChannel) {
		handleCommands(message);
	}
});

client.on('ready', () => {
	console.log(`${client.user.tag} is ready`);
	mcChatChannel = client.channels.cache.get(`${process.env.CHAT_CHANNEL_ID}`);
	mcCommandsChannel = client.channels.cache.get(`${process.env.COMMANDS_CHANNEL_ID}`);
	console.log(mcChatChannel);
	console.log(mcCommandsChannel);
	mcChatChannel.send(new MessageEmbed().setColor('#00ffff').setDescription('The server is starting'));
});

let handleChat = (message) => {
	mcServer.stdin.write(
		'/tellraw @a ["",{"text":"[Discord]","color":"dark_purple"}," <' +
			message.author.username +
			'> ","' +
			message.cleanContent +
			'"]\n'
	);
};

let handleCommands = (message) => {
	if (message.cleanContent.startsWith('/')) return mcServer.stdin.write(message.cleanContent + '\n');
	// handleChat(message);
};

let isCommandChatData = (dataContent) => {
	// Empty server
	if (dataContent.startsWith('No player was found')) return true;

	// This indicates a system message for audit purposes afaict
	if (dataContent.charAt(0) == '[') return true;

	// Ignore system messages about logging in and out
	if (dataContent.includes('logged in with entity id') || dataContent.includes('lost connection:')) return true;

	// Ignore death messages for things like villagers
	if (dataContent.includes('ServerLevel[')) return true;

	// Ignore backups
	if (dataContent.startsWith('Automatic saving is now')) return true;
};

