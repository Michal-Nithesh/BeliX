const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
const { confirmGathering, cancelGathering, updateGatheringTime, getGatheringStatus, createMeeting, recordAttendance, addPoints } = require('../database/db');
const { getDelayUntilNextScheduledTime, getCurrentTimeInTimeZone, formatTimeInTimeZone } = require('../utils/timezoneUtils');

const GATHERING_PROMPT_HOUR = 18; // 6:00 PM
const GATHERING_PROMPT_MINUTE = 0;
const DEFAULT_GATHERING_HOUR = 20; // 8:00 PM (default)
const GATHERING_VOICE_ROOM = '1304848107095326830'; // Voice room channel ID
const GATHERING_DURATION_MS = 60 * 60 * 1000; // 1 hour
const REPORT_CHANNEL_ID = '1361235736774447247'; // Report channel
const REMINDER_MINUTES_BEFORE = 5; // 5-minute reminder

// Track active gathering sessions
const gatheringSessions = new Map();

function findTinkeringChannel(guild) {
    const channelId = process.env.tinkering;
    if (channelId) {
        return guild.channels.cache.get(channelId);
    }
    // Fallback to name matching
    return guild.channels.cache.find(channel =>
        channel.isTextBased() &&
        channel.name?.toLowerCase().includes('tinkering')
    );
}

function findGatheringVoiceChannel(guild) {
    const channelId = GATHERING_VOICE_ROOM;
    if (channelId) {
        const channel = guild.channels.cache.get(channelId);
        if (channel && channel.type === ChannelType.GuildVoice) {
            return channel;
        }
    }
    // Fallback to name matching
    return guild.channels.cache.find(channel =>
        channel.isVoiceBased() &&
        ['common hall', 'common-hall', 'commonhall', 'general', 'gathering'].some(name =>
            channel.name?.toLowerCase().includes(name)
        )
    );
}

function findCommonHallChannel(guild) {
    const channelId = process.env['common-hall'];
    if (channelId) {
        const channel = guild.channels.cache.get(channelId);
        if (channel && channel.type === ChannelType.GuildText) {
            return channel;
        }
    }
    // Fallback to name matching
    return guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildText &&
        ['common hall', 'common-hall', 'commonhall'].some(name =>
            channel.name?.toLowerCase().includes(name)
        )
    );
}

function buildGatheringPromptEmbed(gatheringTime = DEFAULT_GATHERING_HOUR) {
    let timeString = '';
    
    // Handle decimal times (e.g., 19.5 for 7:30 PM)
    if (gatheringTime === 19.5) {
        timeString = '7:30 PM';
    } else {
        const hour = Math.floor(gatheringTime);
        const meridiem = gatheringTime >= 12 ? 'PM' : 'AM';
        timeString = `${hour}:00 ${meridiem}`;
    }
    
    return new EmbedBuilder()
        .setColor('#7f56d9')
        .setTitle('📡 Daily Gathering Confirmation')
        .setDescription(`Today ${timeString}! Is the daily gathering confirmed for today?`)
        .addFields(
            { name: 'Location', value: '📯 Common hall (Voice room)', inline: true },
            { name: 'Time', value: timeString, inline: true }
        )
        .setFooter({ text: 'Anyone can confirm or cancel the gathering' })
        .setTimestamp();
}

function buildConfirmationEmbed(confirmedBy, gatheringTime = DEFAULT_GATHERING_HOUR) {
    let timeString = '';
    let hour = Math.floor(gatheringTime);
    let minute = 0;
    
    // Handle decimal times (e.g., 19.5 for 7:30 PM)
    if (gatheringTime === 19.5) {
        timeString = '7:30 PM';
        hour = 19;
        minute = 30;
    } else {
        const meridiem = gatheringTime >= 12 ? 'PM' : 'AM';
        timeString = `${hour}:00 ${meridiem}`;
    }
    
    // Calculate time until gathering starts
    const now = getCurrentTimeInTimeZone();
    const gatheringStart = new Date(now);
    gatheringStart.setHours(hour, minute, 0, 0);
    
    // If the gathering time has passed, set it for tomorrow
    if (gatheringStart <= now) {
        gatheringStart.setDate(gatheringStart.getDate() + 1);
    }
    
    const timeUntilMs = gatheringStart.getTime() - now.getTime();
    const hoursUntil = Math.floor(timeUntilMs / (1000 * 60 * 60));
    const minutesUntil = Math.floor((timeUntilMs % (1000 * 60 * 60)) / (1000 * 60));
    
    let timeUntilString = '';
    if (hoursUntil > 0) {
        timeUntilString = `${hoursUntil}h ${minutesUntil}m`;
    } else {
        timeUntilString = `${minutesUntil}m`;
    }
    
    const statusMessage = `Daily gathering will start in ${timeUntilString} at ${timeString}`;
    
    return new EmbedBuilder()
        .setColor('#12b76a')
        .setTitle('✅ Daily Gathering Confirmed!')
        .setDescription(`The daily gathering has been confirmed by ${confirmedBy}!`)
        .addFields(
            { name: 'Location', value: '📯 Common hall (Voice room)', inline: true },
            { name: 'Time', value: timeString, inline: true },
            { name: 'Status', value: statusMessage, inline: false }
        )
        .setTimestamp();
}

function buildCancellationEmbed(cancelledBy) {
    return new EmbedBuilder()
        .setColor('#dc3545')
        .setTitle('❌ Daily Gathering Cancelled')
        .setDescription(`Today's gathering has been cancelled by ${cancelledBy}.`)
        .addFields(
            { name: 'Status', value: '🚫 No gathering today', inline: true },
            { name: 'Reason', value: 'Cancelled by member', inline: true }
        )
        .setFooter({ text: 'Please check back tomorrow for the next gathering' })
        .setTimestamp();
}

function buildReminderEmbed(gatheringTime) {
    let timeString = '';
    if (gatheringTime === 19.5) {
        timeString = '7:30 PM';
    } else {
        const hour = Math.floor(gatheringTime);
        const meridiem = gatheringTime >= 12 ? 'PM' : 'AM';
        timeString = `${hour}:00 ${meridiem}`;
    }
    
    return new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle(`⏰ Gathering Starting in 5 Minutes!`)
        .setDescription(`The daily gathering starts at ${timeString}. Join us in the voice room! 🎤`)
        .addFields(
            { name: 'Time', value: timeString, inline: true },
            { name: 'Location', value: '📯 Common hall (Voice room)', inline: true }
        )
        .setTimestamp();
}

function buildGatheringPromptButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('gather_confirm')
            .setLabel('✅ Confirm')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('gather_time_7pm')
            .setLabel('🕖 7:00 PM')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('gather_time_7_30pm')
            .setLabel('🕢 7:30 PM')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('gather_time_8pm')
            .setLabel('🕗 8:00 PM')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('gather_cancel')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Danger)
    );
}

function formatDuration(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

function buildMeetingReportEmbed(meetingTitle, attendanceData, totalDurationMs, plannedDurationMs = GATHERING_DURATION_MS) {
    const durationLabel = formatDuration(totalDurationMs);
    const overtimeMs = Math.max(0, totalDurationMs - plannedDurationMs);
    const overtimeLabel = overtimeMs > 0 ? formatDuration(overtimeMs) : '0m';

    // Build attendance lines
    const attendanceLines = [];
    
    // Sort by duration descending
    const sorted = [...attendanceData].sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));
    
    for (const participant of sorted) {
        const durationMinutes = Math.floor((participant.durationMs || 0) / 60000);
        const percentage = plannedDurationMs > 0 ? Math.min(100, Math.round((durationMinutes / 60) * 100)) : 0;
        const emoji = percentage >= 95 ? '⭐' : '';
        
        attendanceLines.push(
            `• ${participant.displayName || participant.username} - ${durationMinutes}m (${percentage}%) ${emoji}`
        );
    }

    const fullAttendance = attendanceData.filter(p => (p.durationMs || 0) >= (plannedDurationMs * 0.95)).length;

    const embedDescription = `📝 ${meetingTitle}\n🎙️ Channel: Common Hall\n⏱️ Total: ${durationLabel}\n⏱️ Overtime: ${overtimeLabel}\n\n👥 Complete Attendance:\n\n${attendanceLines.join('\n')}\n\n📈 Total: ${attendanceData.length} | Full (95%+): ${fullAttendance}`;

    const embed = new EmbedBuilder()
        .setColor('#12b76a')
        .setTitle('📊 Final Meeting Report')
        .setDescription(embedDescription)
        .setTimestamp();

    return embed;
}

async function startGatheringTracking(guild, gatheringTime) {
    const guildId = guild.id;
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const meetingTitle = `Daily Gathering - ${formatTimeInTimeZone(today, 'date')}`;

    const voiceChannel = findGatheringVoiceChannel(guild);
    if (!voiceChannel) {
        console.warn(`\n⚠️ [GATHERING] Voice channel not found for ${guild.name}`);
        return;
    }

    console.log(`\n🎙️ [GATHERING] Starting tracking for ${guild.name}`);
    console.log(`   Meeting: "${meetingTitle}"`);
    console.log(`   Time: ${formatTimeInTimeZone(today, 'datetime')}`);
    console.log(`   Members in voice channel: ${voiceChannel.members.size}`);

    const session = {
        guildId,
        voiceChannelId: voiceChannel.id,
        meetingTitle,
        gatheringTime,
        startMs: Date.now(),
        participants: new Map(),
        meetingId: null,
    };

    // Create meeting in database
    try {
        let meetingTimeStr = '';
        if (gatheringTime === 19.5) {
            meetingTimeStr = '19:30:00';
        } else {
            const hour = Math.floor(gatheringTime);
            meetingTimeStr = `${String(hour).padStart(2, '0')}:00:00`;
        }
        
        const meeting = await createMeeting({
            title: meetingTitle,
            meeting_date: dateStr,
            meeting_time: meetingTimeStr,
            scheduled_time: meetingTimeStr,
            total_members: voiceChannel.members.size,
        });

        if (meeting) {
            session.meetingId = meeting.meeting_id;
            console.log(`✓ Meeting created - ID: ${session.meetingId}`);
        }
    } catch (error) {
        console.error(`❌ Error creating meeting:`, error.message);
    }

    // Track all current voice channel members
    for (const member of voiceChannel.members.values()) {
        if (!member.user.bot) {
            session.participants.set(member.id, {
                memberId: member.id,
                username: member.user.username,
                displayName: member.displayName || member.user.username,
                joinMs: 0,  // Zero because they were already in channel
                durationMs: 0,
            });
            console.log(`   ✓ Tracking: ${member.displayName || member.user.username}`);
        }
    }

    gatheringSessions.set(guildId, session);
    console.log(`✓ Gathering tracking started - ${session.participants.size} participants\n`);

    // Schedule meeting end after 1 hour
    setTimeout(async () => {
        await endGatheringTracking(guild);
    }, GATHERING_DURATION_MS);
}

async function endGatheringTracking(guild) {
    const guildId = guild.id;
    const session = gatheringSessions.get(guildId);

    if (!session) {
        console.log(`⚠️ No active session for ${guild.name}`);
        return;
    }

    console.log(`\n🏁 [GATHERING] Ending tracking for ${guild.name}`);

    const endMs = Date.now();
    const totalDurationMs = endMs - session.startMs;

    // Calculate final durations and attendance
    const attendanceRecords = [];
    const attendanceData = [];
    
    for (const participant of session.participants.values()) {
        const finalDurationMs = participant.durationMs + (endMs - participant.joinMs);
        participant.durationMs = finalDurationMs;
        const durationMinutes = Math.floor(finalDurationMs / 60000);
        const attendancePercentage = Math.min(100, Math.round((finalDurationMs / GATHERING_DURATION_MS) * 100));
        const qualifiedForPoints = attendancePercentage >= 50;

        attendanceRecords.push({
            meeting_id: session.meetingId,
            member_id: parseInt(participant.memberId, 10),
            username: participant.username,
            display_name: participant.displayName,
            joined_at: new Date(session.startMs).toISOString(),
            left_at: new Date(endMs).toISOString(),
            total_duration_minutes: durationMinutes,
            attendance_percentage: attendancePercentage,
            points_awarded: qualifiedForPoints ? 10 : 0,
        });

        attendanceData.push({
            ...participant,
            durationMs: finalDurationMs,
        });

        const pointsStatus = qualifiedForPoints ? `✓ 10 points awarded` : `✗ No points (${attendancePercentage}%)`;
        console.log(`   ${participant.displayName}: ${durationMinutes}m (${attendancePercentage}%) - ${pointsStatus}`);
    }

    // Record attendance and award points
    if (session.meetingId && attendanceRecords.length > 0) {
        try {
            console.log(`\n📝 Recording attendance for ${attendanceRecords.length} members...`);
            for (const record of attendanceRecords) {
                await recordAttendance(session.meetingId, record);
                
                // Award points if 50%+ attendance
                if (record.points_awarded > 0) {
                    try {
                        await addPoints(record.member_id, record.points_awarded);
                        console.log(`   ✓ ${record.display_name}: +${record.points_awarded} belmonts points`);
                    } catch (pointsError) {
                        console.error(`   ❌ Failed to award points to ${record.display_name}:`, pointsError.message);
                    }
                }
            }
            console.log(`✓ Attendance recorded and points awarded`);
        } catch (error) {
            console.error(`❌ Error recording attendance:`, error.message);
        }
    }

    // Build and send report
    try {
        const reportEmbed = buildMeetingReportEmbed(session.meetingTitle, attendanceData, totalDurationMs);
        
        // Try to send to the specified report channel
        const reportChannel = guild.client.channels.cache.get(REPORT_CHANNEL_ID);
        if (reportChannel && reportChannel.isTextBased()) {
            await reportChannel.send({ embeds: [reportEmbed] });
            console.log(`\n📋 Report sent to channel ${REPORT_CHANNEL_ID}`);
        } else {
            // Fallback to common hall
            const commonHall = findCommonHallChannel(guild);
            if (commonHall) {
                await commonHall.send({ embeds: [reportEmbed] });
                console.log(`\n📋 Report sent to #${commonHall.name} (fallback)`);
            } else {
                console.warn(`⚠️ Could not find report channel or common hall`);
            }
        }
    } catch (error) {
        console.error(`❌ Error sending report:`, error.message);
    }

    // Clean up session
    gatheringSessions.delete(guildId);
    console.log(`✓ Gathering tracking ended\n`);
}

function scheduleDailyGatheringPrompt(client, guild) {
    const rescheduler = () => {
        const delay = getDelayUntilNextScheduledTime(GATHERING_PROMPT_HOUR, GATHERING_PROMPT_MINUTE);
        const hoursUntil = Math.floor(delay / (1000 * 60 * 60));
        const minutesUntil = Math.floor((delay % (1000 * 60 * 60)) / (1000 * 60));
        
        console.log(`📅 [${guild.name}] Next gathering prompt in ${hoursUntil}h ${minutesUntil}m`);
        
        setTimeout(async () => {
            console.log(`\n📢 [${guild.name}] Sending gathering confirmation prompt...`);
            await sendGatheringPrompt(client, guild);
            rescheduler(); // Reschedule for next day
        }, delay);
    };

    rescheduler();
}

async function sendGatheringPrompt(client, guild) {
    const channel = findTinkeringChannel(guild);
    if (!channel) {
        console.warn(`⚠️ Tinkering channel not found in ${guild.name}`);
        return;
    }

    const today = new Date();
    const status = await getGatheringStatus(today);
    let currentGatheringTime = DEFAULT_GATHERING_HOUR;
    
    if (status?.gathering_time) {
        currentGatheringTime = parseInt(status.gathering_time.split(':')[0]);
    }

    const embed = buildGatheringPromptEmbed(currentGatheringTime);
    const buttons = buildGatheringPromptButtons();

    try {
        await channel.send({
            embeds: [embed],
            components: [buttons],
        });
        console.log(`✓ Prompt sent to #${channel.name}`);
    } catch (error) {
        console.error(`Error sending gathering prompt:`, error.message);
    }
}

async function sendGatheringReminder(client, guild, gatheringTime) {
    const channel = findCommonHallChannel(guild);
    if (!channel) {
        console.warn(`⚠️ Common hall channel not found in ${guild.name}`);
        return;
    }

    const embed = buildReminderEmbed(gatheringTime);
    try {
        await channel.send({ embeds: [embed] });
        console.log(`📬 5-minute reminder sent to #${channel.name}`);
    } catch (error) {
        console.error(`Error sending reminder:`, error.message);
    }
}

function handleGatheringConfirmation(client) {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;
        
        // Only handle gather_* buttons
        if (!interaction.customId.startsWith('gather_')) return;

        const guild = interaction.guild;
        const today = new Date();
        const memberId = parseInt(interaction.user.id, 10);
        const memberName = interaction.member?.displayName || interaction.user.username;

        console.log(`\n✋ [${guild.name}] Button: ${interaction.customId} by ${memberName}`);

        // Try to defer interaction immediately
        let deferSuccess = false;
        if (!interaction.deferred && !interaction.replied) {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                deferSuccess = true;
            } catch (deferError) {
                console.warn(`Could not defer interaction: ${deferError.message}`);
                deferSuccess = false;
            }
        } else {
            // Already deferred or replied
            deferSuccess = interaction.deferred;
        }

        try {
            if (interaction.customId === 'gather_confirm') {
                // Get the current gathering time
                const status = await getGatheringStatus(today);
                const currentTime = status?.gathering_time ? parseInt(status.gathering_time.split(':')[0]) : DEFAULT_GATHERING_HOUR;
                
                console.log(`   ✅ Confirmed by ${memberName} for ${currentTime}:00`);
                
                // Store confirmation in database
                const confirmResult = await confirmGathering(memberId, memberName, today, currentTime);
                if (!confirmResult) {
                    console.log(`   ⚠️  Confirmation recorded (user sync pending)`);
                }

                const embed = buildConfirmationEmbed(memberName, currentTime);
                if (deferSuccess) {
                    try {
                        await interaction.editReply({
                            embeds: [embed],
                        });
                    } catch (replyErr) {
                        console.warn(`Could not send confirmation embed: ${replyErr.message}`);
                    }
                } else {
                    // Deferred failed, try to reply
                    try {
                        await interaction.reply({
                            embeds: [embed],
                            flags: MessageFlags.Ephemeral,
                        }).catch(() => {});
                    } catch (replyErr) {
                        console.warn(`Could not reply with confirmation: ${replyErr.message}`);
                    }
                }

                // Schedule reminder and tracking
                let hour = Math.floor(currentTime);
                let minute = 0;
                if (currentTime === 19.5) {
                    hour = 19;
                    minute = 30;
                }

                const now = getCurrentTimeInTimeZone();
                const gatheringStart = new Date(now);
                gatheringStart.setHours(hour, minute, 0, 0);

                if (gatheringStart <= now) {
                    gatheringStart.setDate(gatheringStart.getDate() + 1);
                }

                // Schedule 5-minute reminder
                const reminderDelay = gatheringStart.getTime() - new Date().getTime() - (REMINDER_MINUTES_BEFORE * 60 * 1000);
                if (reminderDelay > 0) {
                    setTimeout(() => {
                        sendGatheringReminder(client, guild, currentTime);
                    }, reminderDelay);
                    console.log(`   📅 5-min reminder scheduled in ${Math.floor(reminderDelay / 60000)}m`);
                }

                // Schedule tracking start
                const trackingDelay = gatheringStart.getTime() - new Date().getTime();
                if (trackingDelay > 0) {
                    setTimeout(() => {
                        startGatheringTracking(guild, currentTime);
                    }, trackingDelay);
                    const trackHours = Math.floor(trackingDelay / (1000 * 60 * 60));
                    const trackMins = Math.floor((trackingDelay % (1000 * 60 * 60)) / (1000 * 60));
                    console.log(`   📅 Tracking scheduled in ${trackHours}h ${trackMins}m`);
                }
            } else if (interaction.customId === 'gather_cancel') {
                console.log(`   ❌ Cancelled by ${memberName}`);
                const cancelResult = await cancelGathering(today, memberId, memberName);
                if (!cancelResult) {
                    console.log(`   ⚠️  Cancellation recorded (user sync pending)`);
                }
                
                const embed = buildCancellationEmbed(memberName);
                if (deferSuccess) {
                    try {
                        await interaction.editReply({
                            embeds: [embed],
                        });
                    } catch (replyErr) {
                        console.warn(`Could not send cancellation embed: ${replyErr.message}`);
                    }
                } else {
                    try {
                        await interaction.reply({
                            embeds: [embed],
                            flags: MessageFlags.Ephemeral,
                        }).catch(() => {});
                    } catch (replyErr) {
                        console.warn(`Could not reply with cancellation: ${replyErr.message}`);
                    }
                }
            } else if (interaction.customId.startsWith('gather_time_')) {
                let displayTime = '8:00 PM';
                let timeStr = '20:00:00';
                
                if (interaction.customId === 'gather_time_7pm') {
                    displayTime = '7:00 PM';
                    timeStr = '19:00:00';
                } else if (interaction.customId === 'gather_time_7_30pm') {
                    displayTime = '7:30 PM';
                    timeStr = '19:30:00';
                } else if (interaction.customId === 'gather_time_8pm') {
                    displayTime = '8:00 PM';
                    timeStr = '20:00:00';
                }

                console.log(`   🕐 Time changed to ${displayTime}`);
                const updateResult = await updateGatheringTime(today, timeStr);
                if (!updateResult) {
                    console.log(`   ⚠️  Time update recorded (user sync pending)`);
                }
                
                if (deferSuccess) {
                    try {
                        await interaction.editReply({
                            content: `✅ Gathering time updated to ${displayTime} by ${memberName}`,
                        });
                    } catch (replyErr) {
                        console.warn(`Could not send time update: ${replyErr.message}`);
                    }
                } else {
                    try {
                        await interaction.reply({
                            content: `✅ Gathering time updated to ${displayTime} by ${memberName}`,
                            flags: MessageFlags.Ephemeral,
                        }).catch(() => {});
                    } catch (replyErr) {
                        console.warn(`Could not reply with time update: ${replyErr.message}`);
                    }
                }
            }
        } catch (error) {
            console.error(`Error handling button:`, error.message);
            // Only try to respond if we haven't already
            try {
                if (deferSuccess) {
                    await interaction.editReply({
                        content: `❌ An error occurred: ${error.message}`,
                    }).catch(() => {}); // Silently fail if already replied
                } else if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: `❌ An error occurred: ${error.message}`,
                        flags: MessageFlags.Ephemeral,
                    }).catch(() => {}); // Silently fail if can't reply
                }
            } catch (replyError) {
                // Silently ignore reply errors - interaction was already handled
            }
        }
    });
}

function handleVoiceStateUpdates(client) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        const guild = newState.guild || oldState.guild;
        if (!guild) return;

        const guildId = guild.id;
        const session = gatheringSessions.get(guildId);
        if (!session) return; // No active gathering session

        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        const voiceRoom = GATHERING_VOICE_ROOM;
        const leftChannel = oldState.channelId === voiceRoom && newState.channelId !== voiceRoom;
        const joinedChannel = newState.channelId === voiceRoom && oldState.channelId !== voiceRoom;

        if (joinedChannel) {
            // Member joined the gathering voice channel
            if (!session.participants.has(member.id)) {
                session.participants.set(member.id, {
                    memberId: member.id,
                    username: member.user.username,
                    displayName: member.displayName || member.user.username,
                    joinMs: 0,  // They are joining now
                    durationMs: 0,
                });
                console.log(`   ✓ ${member.displayName || member.user.username} joined gathering`);
            }
        } else if (leftChannel) {
            // Member left the gathering voice channel
            const participant = session.participants.get(member.id);
            if (participant) {
                const partialDuration = Date.now() - session.startMs - participant.joinMs;
                participant.durationMs += partialDuration;
                const minutes = Math.floor(participant.durationMs / 60000);
                console.log(`   ✗ ${participant.displayName} left gathering (${minutes}m total)`);
            }
        }
    });
}

function handleGatheringScheduler(client) {
    // Setup scheduler function
    const setupScheduler = () => {
        const guilds = client.guilds.cache;
        
        let successCount = 0;
        for (const guild of guilds.values()) {
            try {
                scheduleDailyGatheringPrompt(client, guild);
                successCount++;
                console.log(`✓ ${guild.name} - gathering scheduler enabled`);
            } catch (error) {
                console.error(`❌ Error setting up scheduler for ${guild.name}:`, error.message);
            }
        }
        console.log(`\n✓ Daily gathering scheduler initialized (${successCount}/${guilds.size} guilds)\n`);
    };

    // Try both events for maximum compatibility
    if (client.isReady()) {
        // If bot is already ready, schedule immediately
        console.log('🤖 Bot already ready, setting up gathering scheduler now...');
        setupScheduler();
    } else {
        // Otherwise wait for ready event
        const readyHandler = () => {
            setupScheduler();
            client.removeListener('ready', readyHandler);
            client.removeListener('clientReady', readyHandler);
        };
        
        client.on('ready', readyHandler);
        client.on('clientReady', readyHandler);
    }

    // Handle new guild joins
    client.on('guildCreate', (guild) => {
        console.log(`📍 Bot joined new guild: ${guild.name}`);
        scheduleDailyGatheringPrompt(client, guild);
    });

    // Handle button interactions for confirmation
    handleGatheringConfirmation(client);

    // Handle voice state updates for tracking
    handleVoiceStateUpdates(client);
}

module.exports = {
    handleGatheringScheduler,
};
