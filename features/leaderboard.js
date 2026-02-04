const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getLeaderboard } = require('../database/db');

function buildLeaderboardEmbed(leaderboardData, page = 1) {
    // leaderboardData is already sorted from database
    const itemsPerPage = 10;
    const totalPages = Math.ceil(leaderboardData.length / itemsPerPage) || 1;
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageUsers = leaderboardData.slice(startIndex, endIndex);

    let leaderboardText = '';
    pageUsers.forEach((entry, index) => {
        const position = startIndex + index + 1;
        const displayName = entry.members?.display_name || entry.members?.username || 'Unknown';
        leaderboardText += `**${position}) ${displayName}** - ${entry.points} points\n`;
    });

    // Handle empty leaderboard
    if (!leaderboardText || leaderboardData.length === 0) {
        leaderboardText = 'No members in this guild yet. Members will appear here once they join!';
    }

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

function buildMyPointsEmbed(memberData, pointsData) {
    const username = memberData?.display_name || memberData?.username || 'Unknown';
    const totalPoints = pointsData?.points || 0;
    const lastUpdate = pointsData?.last_update ? new Date(pointsData.last_update).toLocaleString() : 'Never';
    
    return new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📊 Your Points & Statistics')
        .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        .addFields(
            { name: '👤 Username', value: `\`${username}\``, inline: false },
            { name: '⭐ Total Points', value: `\`\`\`${totalPoints} points\`\`\``, inline: false },
            { name: '📅 Last Update', value: `\`${lastUpdate}\``, inline: false }
        )
        .setFooter({ text: 'Keep earning points to climb the leaderboard! 🚀' })
        .setTimestamp();
}

module.exports = {
    buildLeaderboardEmbed,
    getLeaderboardButtons,
    buildMyPointsEmbed,
};
