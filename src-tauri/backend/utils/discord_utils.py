import multiprocessing

import discord
from discord import LoginFailure
from discord.ext.tasks import loop

from utils.settings import Settings
from utils.message_log import MessageLog


class MyClient:
    """
    Prints and sends all messages in its Queue to the user via Discord private DMs.

    Attributes
    ----------
    bot (discord.Client): The Client object for Discord interaction.

    user_id (int): The User ID on Discord that uniquely identifies them.

    queue (multiprocessing.Queue): The Queue holding messages to be sent to the user over Discord.

    test_queue (multiprocessing.Queue, optional): A workaround to notifying the tester that an error occurred. Defaults to None.

    """

    def __init__(self, bot: discord.Client, user_id: int, queue: multiprocessing.Queue, test_queue: multiprocessing.Queue = None):
        self.bot = bot
        self.user = None
        self.user_id = user_id
        self.queue = queue
        self.test_queue = test_queue
        self.print_status.start()

    @loop()
    async def print_status(self):
        """Grab each message in the Queue and send it as a private DM to the user.

        Returns:
            None
        """
        if self.user is not None and not self.queue.empty():
            message: str = self.queue.get()
            if Settings.debug_mode:
                MessageLog.print_message(f"\n[DEBUG] Acquired message to send via Discord DM: {message}")
            await self.user.send(content = message)

    @print_status.before_loop
    async def before_print_status(self):
        """Determine when the bot has successfully connected to the Discord API and found the user.

        Returns:
            None
        """
        MessageLog.print_message("[DISCORD] Waiting for connection to Discord API...")
        await self.bot.wait_until_ready()
        MessageLog.print_message("[DISCORD] Successful connection to Discord API")
        self.queue.put(f"```diff\n+ Successful connection to Discord API for Granblue Automation\n```")

        try:
            self.user = await self.bot.fetch_user(self.user_id)
            MessageLog.print_message(f"[DISCORD] Found user: {self.user.name}")
            if self.test_queue is not None:
                self.test_queue.put(f"[DISCORD] Found user: {self.user.name}")
        except discord.errors.NotFound:
            MessageLog.print_message("[DISCORD] Failed to find user using provided user ID.\n")
            if self.test_queue is not None:
                self.test_queue.put("[DISCORD] Failed to find user using provided user ID.")


def start_now(token: str, user_id: int, queue: multiprocessing.Queue, test_queue: multiprocessing.Queue = None):
    """Initialize the Client object and begin the process to connect to the Discord API.

    Args:
        token (str): Discord Token for use with Discord's API.
        user_id (int): The user's Discord user ID.
        queue (multiprocessing.Queue): The Queue holding messages to be sent to the user over Discord.
        test_queue (multiprocessing.Queue, optional): A workaround to notifying the tester that an error occurred. Defaults to None.

    Returns:
        None
    """
    client = discord.Client()
    MyClient(client, user_id, queue, test_queue)
    try:
        client.run(token)
        if test_queue is not None:
            test_queue.put("[DISCORD] Successful connection.")
    except LoginFailure:
        MessageLog.print_message("\n[DISCORD] Failed to connect to Discord API using provided token.\n")
        if test_queue is not None:
            test_queue.put("[DISCORD] Failed to connect to Discord API using provided token.")
