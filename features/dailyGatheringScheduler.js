const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
const { getDelayUntilNextScheduledTime, getCurrentTimeInTimeZone } = require('../utils/timezoneUtils');
const { 
    confirmGathering, 
    cancelGathering, 
    updateGatheringTime, 
    getGatheringStatus,
    createMeeting,
    updateMeetingEnd,
    updateMeetingTime,
    getMeetingByDate,
    recordAttendance,
    getMember,
    addPoints
} = require('../database/db');

// Channel IDs
const TINKERING_CHANNEL_ID = process.env.tinkering || '1361235736774447247';
const COMMON_HALL_CHANNEL_ID = process.env['common-hall'] || '1304848106789015647';
const REPORTS_CHANNEL_ID = '1475575831601610862';
const VOICE_ROOM_ID = process.env['voiceroom-Common-hall'] || '1304848107095326830';
const BELMONTS_ROLE_ID = '1307057022453153813';

// Store tracking data
const gatheringSession = {
    isActive: false,
    meetingId: null,
    startTime: null,
    attendees: new Map(), // userId -> {username, displayName, joinedAt, leftAt}
    messageId: null,
    endTimeout: null, // Store timeout ID so we can clear it if needed
};

const TIME_PROMPT_HOUR = 18; // 6 PM
const TIME_PROMPT_MINUTE = 0; // 00 minutes

/**
 * Ask for gathering time in tinkering channel
 */
async function askForGatheringTime(client) {
    try {
        const channel = client.channels.cache.get(TINKERING_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) {
            console.warn(`⚠ Tinkering channel not found`);
            return;
        }

        const today = getCurrentTimeInTimeZone();
        const dateStr = today.toLocaleDateString();

        const embed = new EmbedBuilder()
            .setColor('#FF6B9D')
            .setTitle(`📅 Daily Gathering Time - ${dateStr}`)
            .setDescription(`What time should today's daily gathering be held?`)
            .addFields(
                { name: '📝 Instructions', value: 'Use the buttons below to set the gathering time or cancel today\'s gathering.' }
            )
            .setFooter({ text: 'Click on a time or cancel button' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gathering_time_1900')
                    .setLabel('7:00 PM')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('gathering_time_1930')
                    .setLabel('7:30 PM')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('gathering_time_2000')
                    .setLabel('8:00 PM')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('gathering_cancel')
                    .setLabel('Cancel Today')
                    .setStyle(ButtonStyle.Danger)
            );

        await channel.send({ embeds: [embed], components: [row] });
        console.log(`✓ Asked for gathering time in tinkering channel`);
    } catch (error) {
        console.error(`Error asking for gathering time:`, error.message);
    }
}

/**
 * Schedule gathering time prompt
 */
function scheduleGatheringPrompt(client) {
    function scheduleNext() {
        const delay = getDelayUntilNextScheduledTime(TIME_PROMPT_HOUR, TIME_PROMPT_MINUTE);
        const hoursUntil = Math.floor(delay / (1000 * 60 * 60));
        const minutesUntil = Math.floor((delay % (1000 * 60 * 60)) / (1000 * 60));

        console.log(
            `📅 [Belmonts] Next gathering prompt in ${hoursUntil}h ${minutesUntil}m`
        );

        setTimeout(async () => {
            await askForGatheringTime(client);
            scheduleNext();
        }, delay);
    }

    scheduleNext();
}

/**
 * Post gathering announcement to common-hall
 */
async function postGatheringAnnouncement(client, gatheringTime) {
    try {
        const channel = client.channels.cache.get(COMMON_HALL_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) {
            console.warn(`⚠ Common hall channel not found`);
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#4a90e2')
            .setTitle(`🎙️ Today's Daily Gathering`)
            .setDescription(`<@&${BELMONTS_ROLE_ID}> Daily Gathering scheduled for today!`)
            .addFields(
                { name: '⏰ Time', value: `**${gatheringTime}**`, inline: false },
                { name: '🎙️ Location', value: 'Voice Channel: Common Hall', inline: false },
                { name: '📌 Note', value: 'Please join on time and participate actively!' }
            )
            .setFooter({ text: 'See you there!' })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
        console.log(`✓ Posted gathering announcement to common-hall at ${gatheringTime}`);
    } catch (error) {
        console.error(`Error posting announcement:`, error.message);
    }
}

/**
 * Send reminder 5 minutes before gathering
 */
async function sendGatheringReminder(client, gatheringTime) {
    try {
        const channel = client.channels.cache.get(TINKERING_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`⏰ Reminder: Gathering Starting Soon!`)
            .setDescription(`<@&${BELMONTS_ROLE_ID}> Daily Gathering will start in **5 minutes**!`)
            .addFields(
                { name: '⏰ Time', value: `**${gatheringTime}**`, inline: false },
                { name: '🎙️ Channel', value: 'Join: Common Hall Voice Room', inline: false }
            )
            .setColor('#FFD700')
            .setFooter({ text: 'Get ready! ⏱️' })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
        console.log(`✓ Sent 5-minute reminder for gathering at ${gatheringTime}`);
    } catch (error) {
        console.error(`Error sending reminder:`, error.message);
    }
}

/**
 * Start tracking meeting
 */
async function startMeetingTracking(client, gatheringDate, gatheringTime) {
    try {
        const meetingTitle = `Daily Gathering - ${gatheringDate}`;
        const [hours, minutes] = gatheringTime.split(':');

        // Check if a meeting already exists for this date
        let meeting = await getMeetingByDate(gatheringDate);
        
        if (meeting && meeting.meeting_id) {
            // Meeting already exists, update the time
            console.log(`📝 Meeting already exists for ${gatheringDate}, updating time...`);
            const timeStr = `${hours}:${minutes}:00`;
            const updated = await updateMeetingTime(meeting.meeting_id, timeStr);
            
            if (updated) {
                // Calculate the actual meeting start time
                const now = getCurrentTimeInTimeZone();
                const meetingStartTime = new Date(now);
                meetingStartTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                if (meetingStartTime <= now) {
                    meetingStartTime.setDate(meetingStartTime.getDate() + 1);
                }

                gatheringSession.meetingId = meeting.meeting_id;
                gatheringSession.isActive = true;
                gatheringSession.startTime = meetingStartTime;  // Use actual meeting time
                gatheringSession.attendees.clear();
                console.log(`✓ Meeting time updated to ${gatheringTime} (ID: ${gatheringSession.meetingId})`);
            } else {
                console.error(`Failed to update meeting time`);
                return;
            }
        } else {
            // Create new meeting
            const now = getCurrentTimeInTimeZone();
            // Calculate the actual meeting start time (not current time)
            const meetingStartTime = new Date(now);
            meetingStartTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            
            // If the meeting time is in the past, it's for tomorrow
            if (meetingStartTime <= now) {
                meetingStartTime.setDate(meetingStartTime.getDate() + 1);
            }

            const meetingData = {
                title: meetingTitle,
                meeting_date: gatheringDate,
                meeting_time: `${hours}:${minutes}:00`,
                start_time: meetingStartTime.toISOString(),
            };

            // Create meeting in database
            meeting = await createMeeting(meetingData);
            if (!meeting || !meeting.meeting_id) {
                console.error(`Failed to create meeting`);
                return;
            }

            gatheringSession.meetingId = meeting.meeting_id;
            gatheringSession.isActive = true;
            gatheringSession.startTime = meetingStartTime;  // Use actual meeting time for tracking
            gatheringSession.attendees.clear();

            console.log(`✓ New meeting tracking started (ID: ${gatheringSession.meetingId}) at ${meetingStartTime.toLocaleTimeString()}`);
        }
    } catch (error) {
        console.error(`Error starting meeting tracking:`, error.message);
    }
}

/**
 * Track voice channel attendance
 */
async function trackVoiceActivity(client) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        if (!gatheringSession.isActive || !gatheringSession.meetingId) return;

        const voiceChannelId = VOICE_ROOM_ID;
        const userId = newState.id;
        const member = newState.member;

        // User joined the gathering voice channel
        if (!oldState.channel && newState.channel?.id === voiceChannelId) {
            const displayName = member?.displayName || member?.user.username;
            gatheringSession.attendees.set(userId, {
                username: member?.user.username,
                displayName: displayName,
                joinedAt: new Date(),
                leftAt: null,
            });
            console.log(`✓ ${displayName} joined gathering`);
        }

        // User left the gathering voice channel
        if (oldState.channel?.id === voiceChannelId && !newState.channel) {
            const attendee = gatheringSession.attendees.get(userId);
            if (attendee) {
                attendee.leftAt = new Date();
                console.log(`✓ ${attendee.displayName} left gathering`);
            }

            // Check if voice channel is now empty
            const voiceChannel = client.channels.cache.get(voiceChannelId);
            if (voiceChannel && voiceChannel.isVoiceBased()) {
                const members = voiceChannel.members.filter(m => !m.user.bot);
                
                if (members.size === 0 && gatheringSession.isActive) {
                    console.log(`📢 Voice channel is empty! Ending gathering and sending report...`);
                    
                    // Clear the 2-hour timeout
                    if (gatheringSession.endTimeout) {
                        clearTimeout(gatheringSession.endTimeout);
                        gatheringSession.endTimeout = null;
                    }
                    
                    // End gathering immediately
                    await endGatheringAndReport(client);
                }
            }
        }
    });
}

/**
 * End gathering and generate report
 */
async function endGatheringAndReport(client) {
    if (!gatheringSession.isActive || !gatheringSession.meetingId) {
        console.log(`⚠ No active gathering to end`);
        return;
    }

    try {
        // Clear any pending timeout
        if (gatheringSession.endTimeout) {
            clearTimeout(gatheringSession.endTimeout);
            gatheringSession.endTimeout = null;
        }

        const endTime = new Date();
        const startTime = gatheringSession.startTime;
        const totalDurationMs = Math.abs(endTime - startTime);
        const totalDurationMinutes = Math.floor(totalDurationMs / (1000 * 60));
        const hours = Math.floor(totalDurationMinutes / 60);
        const minutes = totalDurationMinutes % 60;

        // Calculate attendance for each member
        const attendanceRecords = [];
        let fullyAttendedCount = 0;

        for (const [userId, attendee] of gatheringSession.attendees) {
            if (!attendee.leftAt) {
                attendee.leftAt = endTime;
            }

            const durationMs = attendee.leftAt - attendee.joinedAt;
            const durationMinutes = Math.floor(durationMs / (1000 * 60));
            const attendancePercentage = Math.round((durationMinutes / totalDurationMinutes) * 100);

            // Award points: 10 points for 50%+ attendance
            let pointsAwarded = 0;
            if (attendancePercentage >= 50) {
                pointsAwarded = 10;
                if (attendancePercentage >= 95) {
                    fullyAttendedCount++;
                }
            }

            attendanceRecords.push({
                userId,
                displayName: attendee.displayName,
                durationMinutes,
                attendancePercentage,
                pointsAwarded,
            });

            // Record attendance in database
            try {
                // Get the database member_id by looking up the Discord ID
                const member = await getMember(userId);
                const memberId = member ? member.member_id : null;

                if (!memberId) {
                    console.warn(`Warning: Member ${userId} (${attendee.displayName}) not found in database, skipping attendance record`);
                    continue;
                }

                const attendanceData = {
                    member_id: memberId,
                    username: attendee.username,
                    display_name: attendee.displayName,
                    joined_at: attendee.joinedAt.toISOString(),
                    left_at: attendee.leftAt.toISOString(),
                    total_duration_minutes: durationMinutes,
                    attendance_percentage: attendancePercentage,
                    points_awarded: pointsAwarded,
                };
                await recordAttendance(gatheringSession.meetingId, attendanceData);
                
                // Add points to member if they earned any
                if (pointsAwarded > 0) {
                    await addPoints(memberId, pointsAwarded);
                    console.log(`✓ Added ${pointsAwarded} points to ${attendee.displayName}`);
                }
            } catch (error) {
                console.error(`Error recording attendance for ${attendee.displayName}:`, error.message);
            }
        }

        // Sort by attendance percentage (descending)
        attendanceRecords.sort((a, b) => b.attendancePercentage - a.attendancePercentage);

        // Build report embed
        const embed = new EmbedBuilder()
            .setColor('#10B981')
            .setTitle(`📊 Final Meeting Report`)
            .addFields({
                name: `📅 Daily Gathering - ${getCurrentTimeInTimeZone().toLocaleDateString()}`,
                value: `🎙️ Channel: Common Hall`,
                inline: false
            })
            .addFields({
                name: `⏱️ Meeting Duration`,
                value: `${hours}h ${minutes}m`,
                inline: true
            })
            .addFields({
                name: `👥 Total Attendees`,
                value: `${gatheringSession.attendees.size}`,
                inline: true
            });

        // Add attendance details in chunks to avoid Discord field limit
        if (attendanceRecords.length > 0) {
            const chunkSize = 20; // Split attendees into chunks of 20
            for (let i = 0; i < attendanceRecords.length; i += chunkSize) {
                const chunk = attendanceRecords.slice(i, i + chunkSize);
                let attendanceText = ``;
                chunk.forEach((record) => {
                    const medal = record.attendancePercentage >= 95 ? `⭐` : ``;
                    attendanceText += `${medal} **${record.displayName}** - ${record.durationMinutes}m (${record.attendancePercentage}%)\n`;
                });

                const fieldName = i === 0 ? `📋 Attendance List` : `📋 Attendance List (cont'd)`;
                embed.addFields({
                    name: fieldName,
                    value: attendanceText || 'No attendees',
                    inline: false
                });
            }
        }

        embed.addFields({
            name: `⭐ Full Attendance (95%+)`,
            value: `${fullyAttendedCount} members`,
            inline: true
        });

        embed.setFooter({ text: 'Meeting concluded' })
            .setTimestamp();

        // Send report to chamber-of-reckoning (reports channel)
        const reportsChannel = client.channels.cache.get(REPORTS_CHANNEL_ID);
        if (reportsChannel && reportsChannel.isTextBased()) {
            await reportsChannel.send({ embeds: [embed] });
            console.log(`✓ Meeting report sent to chamber-of-reckoning`);
        } else {
            console.warn(`⚠ Reports channel not found`);
        }

        // Update meeting end time in database
        try {
            await updateMeetingEnd(gatheringSession.meetingId, {
                end_time: endTime.toISOString(),
                duration_minutes: totalDurationMinutes,
                attended_members: gatheringSession.attendees.size,
            });
        } catch (error) {
            console.error(`Error updating meeting end time:`, error.message);
        }

        // Reset session
        gatheringSession.isActive = false;
        gatheringSession.meetingId = null;
        gatheringSession.attendees.clear();
        gatheringSession.endTimeout = null;

        console.log(`✓ Gathering tracking ended and report generated`);
    } catch (error) {
        console.error(`Error ending gathering:`, error.message);
    }
}

/**
 * Handle gathering time selection
 */
async function handleGatheringTimeSelection(client, interaction) {
    try {
        // Defer the interaction immediately to avoid timeout
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true }).catch(err => {
                console.warn(`⚠ Failed to defer interaction:`, err.message);
            });
        }

        const customId = interaction.customId;
        const userId = interaction.user.id;
        const member = interaction.member;
        const displayName = member?.displayName || interaction.user.username;

        if (!interaction.isButton()) return;

        let gatheringTime = null;
        let isCancellation = false;

        if (customId === 'gathering_time_1900') {
            gatheringTime = '19:00 (7:00 PM)';
        } else if (customId === 'gathering_time_1930') {
            gatheringTime = '19:30 (7:30 PM)';
        } else if (customId === 'gathering_time_2000') {
            gatheringTime = '20:00 (8:00 PM)';
        } else if (customId === 'gathering_cancel') {
            isCancellation = true;
        }

        const today = getCurrentTimeInTimeZone().toISOString().split('T')[0];

        if (isCancellation) {
            // Cancel gathering
            await cancelGathering(today, userId, displayName);

            const embed = new EmbedBuilder()
                .setColor('#EF4444')
                .setTitle(`❌ Gathering Cancelled`)
                .setDescription(`Today's gathering has been cancelled by ${displayName}`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] }).catch(err => {
                console.warn(`⚠ Failed to edit reply:`, err.message);
            });

            // Notify common-hall
            const channel = client.channels.cache.get(COMMON_HALL_CHANNEL_ID);
            if (channel && channel.isTextBased()) {
                const cancelEmbed = new EmbedBuilder()
                    .setColor('#EF4444')
                    .setTitle(`❌ Daily Gathering Cancelled`)
                    .setDescription(`Today's gathering has been cancelled.`)
                    .setFooter({ text: `Cancelled by: ${displayName}` })
                    .setTimestamp();

                await channel.send({ embeds: [cancelEmbed] });
            }

            console.log(`✓ Gathering cancelled by ${displayName}`);
        } else {
            // Confirm gathering with time
            const timeStr = gatheringTime.split(' ')[0] + ':00';
            await confirmGathering(userId, displayName, today, timeStr);
            await updateGatheringTime(today, gatheringTime.split(' ')[0]);

            const embed = new EmbedBuilder()
                .setColor('#10B981')
                .setTitle(`✅ Gathering Time Set`)
                .setDescription(`Gathering confirmed for today at ${gatheringTime}`)
                .setFooter({ text: `Set by: ${displayName}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] }).catch(err => {
                console.warn(`⚠ Failed to edit reply:`, err.message);
            });

            // Post announcement
            await postGatheringAnnouncement(client, gatheringTime);

            // Schedule reminder (5 minutes before)
            const [time] = gatheringTime.split(' ');
            const [hours, minutes] = time.split(':');
            const targetHour = parseInt(hours);
            const targetMinute = parseInt(minutes);

            // Calculate delay to gathering time using timezone-aware functions
            const now = getCurrentTimeInTimeZone();
            const gatheringTimeToday = new Date(now);
            gatheringTimeToday.setHours(targetHour, targetMinute, 0, 0);

            // If gathering time has passed, it's for tomorrow
            let gatheringDateTime = gatheringTimeToday;
            if (gatheringTimeToday <= now) {
                gatheringDateTime = new Date(gatheringTimeToday);
                gatheringDateTime.setDate(gatheringDateTime.getDate() + 1);
            }

            // Calculate reminder time (5 minutes before)
            const reminderDateTime = new Date(gatheringDateTime.getTime() - 5 * 60 * 1000);

            // Calculate delay accounting for timezone offset
            const systemNow = new Date();
            const tzOffset = systemNow.getTime() - now.getTime();
            const adjustedReminderTime = reminderDateTime.getTime() + tzOffset;
            const delayMs = Math.max(0, adjustedReminderTime - systemNow.getTime());

            console.log(`⏰ Reminder scheduled: gathering=${gatheringDateTime.toLocaleTimeString()}, reminder=${reminderDateTime.toLocaleTimeString()}, delay=${delayMs}ms`);

            if (delayMs > 0) {
                setTimeout(() => sendGatheringReminder(client, gatheringTime), delayMs);
                console.log(`✓ 5-minute reminder will be sent in ${Math.round(delayMs / 1000 / 60)} minutes`);
            } else {
                console.warn(`⚠ Reminder time is in the past. Not scheduling.`);
            }

            // Start meeting tracking
            const dateStr = getCurrentTimeInTimeZone().toISOString().split('T')[0];
            console.log(`📋 Starting meeting tracking for ${dateStr} at ${time}...`);
            await startMeetingTracking(client, dateStr, time);
            
            // Check if meeting tracking started successfully
            if (!gatheringSession.meetingId) {
                console.error(`❌ Failed to start meeting tracking`);
                await interaction.followUp({ 
                    content: '⚠️ Warning: Meeting tracking may have failed. Please report this issue.',
                    ephemeral: true 
                }).catch(err => console.warn(`Could not send follow-up:`, err.message));
                return;
            }

            // Schedule end after 2 hours (or earlier if everyone leaves)
            if (gatheringSession.endTimeout) {
                clearTimeout(gatheringSession.endTimeout);
            }
            gatheringSession.endTimeout = setTimeout(() => {
                console.log(`⏰ 2-hour timeout reached, ending gathering...`);
                endGatheringAndReport(client);
            }, 2 * 60 * 60 * 1000);

            console.log(`✓ Gathering confirmed for ${gatheringTime} with tracking ID ${gatheringSession.meetingId}`);
        }
    } catch (error) {
        console.error(`Error handling gathering time selection:`, error.message);
        
        // Try to reply with error if interaction is still available
        if (interaction && !interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: '⚠️ An error occurred while setting the gathering time. Please try again.', ephemeral: true });
            } catch (replyErr) {
                console.warn(`Could not send error reply:`, replyErr.message);
            }
        } else if (interaction && interaction.deferred) {
            try {
                await interaction.editReply({ content: '⚠️ An error occurred while setting the gathering time. Please try again.' });
            } catch (editErr) {
                console.warn(`Could not send error edit:`, editErr.message);
            }
        }
    }
}

/**
 * Initialize gathering scheduler
 */
function handleGatheringScheduler(client) {
    client.once('ready', () => {
        console.log('✓ Belmonts - gathering scheduler enabled');
        scheduleGatheringPrompt(client);
        trackVoiceActivity(client);
    });

    // Handle button interactions
    client.on('interactionCreate', async (interaction) => {
        try {
            if (interaction.customId?.startsWith('gathering_')) {
                await handleGatheringTimeSelection(client, interaction);
            }
        } catch (error) {
            console.error(`Error in interactionCreate handler:`, error.message);
            // Try to respond with error, but don't crash if interaction is invalid
            if (interaction && !interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({ content: '⚠️ An error occurred processing your request.', ephemeral: true });
                } catch (replyErr) {
                    console.warn(`Could not send error reply:`, replyErr.message);
                }
            }
        }
    });
}

module.exports = { 
    handleGatheringScheduler,
    endGatheringAndReport
};
