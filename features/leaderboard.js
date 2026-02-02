const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const POINTS_FILE = path.join(__dirname, '../points.json');

// Load points data
function loadPoints() {
    if (fs.existsSync(POINTS_FILE)) {
        return JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8'));
    }
    return {};
}

function buildLeaderboardEmbed(points, page = 1, allMembers = []) {
    // Create a map of all members with their points
    const memberMap = new Map();
    
    // Add all members with 0 points initially
    allMembers.forEach(member => {
        if (!member.user.bot) {
            memberMap.set(member.user.id, {
                username: member.user.username,
                points: 0,
                lastUpdate: null
            });
        }
    });
    
    // Update with actual points
    Object.entries(points).forEach(([userId, userData]) => {
        memberMap.set(userId, userData);
    });
    
    // Sort by points descending
    const sortedUsers = Array.from(memberMap.entries())
        .sort((a, b) => b[1].points - a[1].points);

    const itemsPerPage = 10;
    const totalPages = Math.ceil(sortedUsers.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageUsers = sortedUsers.slice(startIndex, endIndex);

    let leaderboardText = '';
    pageUsers.forEach((entry, index) => {
        const [, userData] = entry;
        const position = startIndex + index + 1;
        leaderboardText += `**${position}) @${userData.username}** - ${userData.points} points\n`;
    });

    return new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🏆 Leaderboard')
        .setDescription(leaderboardText)
        .setFooter({ text: `Page ${page}/${totalPages}` })
        .setTimestamp();
}

function getLeaderboardButtons(page = 1, totalPages = 1) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`leaderboard_back_${page}`)
            .setLabel('Back')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 1),
        new ButtonBuilder()
            .setCustomId(`leaderboard_next_${page}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === totalPages)
    );
}

function buildMyPointsEmbed(userPoints) {
    return new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📊 Your Points')
        .addFields(
            { name: 'Username', value: userPoints.username, inline: true },
            { name: 'Total Points', value: `${userPoints.points}`, inline: true },
            { name: 'Last Update', value: new Date(userPoints.lastUpdate).toLocaleString(), inline: false }
        )
        .setTimestamp();
}

module.exports = {
    loadPoints,
    buildLeaderboardEmbed,
    getLeaderboardButtons,
    buildMyPointsEmbed,
};
