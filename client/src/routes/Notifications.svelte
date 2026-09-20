<script>
  import { onMount } from 'svelte';
  import ReadingPage from '../lib/ReadingPage.svelte';
  import { currentUser } from '../stores/auth.js';
  import { getDiscordEntry } from '../api/discord.js';

  /**
   * The page for a student who would come to things if they heard about them.
   *
   * Every other way into VIA assumes somebody already thought to open it, and
   * most people do not open a website to find out whether anything is on. So
   * this page is about hearing rather than looking. It leads with what a person
   * gets, and the one action it offers is adding VIA to their own Discord
   * account: no server, no club, and nobody's permission.
   *
   * The Discord bot is how it works rather than what it is for, which is why
   * the heading is about events and the bot is named further down. Somebody who
   * has never thought about a bot has thought about missing things.
   */

  let entry = $state(null);
  let asked = $state(false);

  const linked = $derived(Boolean($currentUser?.discord?.linked));

  onMount(async () => {
    try {
      entry = await getDiscordEntry();
    } catch {
      // The page is worth reading whether or not the addresses came back, so a
      // failure leaves the offer out rather than replacing the page with an
      // error somebody can do nothing about.
      entry = null;
    } finally {
      asked = true;
    }
  });
</script>

<svelte:head>
  <title>Never miss an ECE event at Illinois: VIA</title>
</svelte:head>

<ReadingPage title="Never miss an ECE event">
  <p class="lead">
    Talks, workshops, socials and info sessions run by ECE student organizations happen
    every week, and most people find out about them afterwards. VIA can tell you what is
    coming up and remind you before the things you said you cared about, so that hearing
    about an event is not something you have to remember to go and check.
  </p>

  <h2>How it reaches you</h2>
  <p>
    VIA does this through Discord, which is where most ECE organizations already are. You
    add VIA to your own Discord account, and it writes to you directly. You do not need a
    server of your own, you do not need to be in any organization's server, and you do not
    need anybody's permission.
  </p>

  {#if entry?.personal_install_url}
    <p class="act">
      <a class="btn primary" href={entry.personal_install_url}
        target="_blank" rel="noopener noreferrer">
        Add VIA to Discord
      </a>
    </p>
  {:else if asked}
    <p class="quiet">
      Adding VIA to Discord is not available on this deployment just now.
    </p>
  {/if}

  <h2>What it sends</h2>
  <ul>
    <li>A weekly note of what is coming up, on the day and at the hour you choose.</li>
    <li>A reminder before an event you marked yourself interested in.</li>
    <li>Exam dates for the courses you add, ahead of each one.</li>
    <li>Answers when you ask it: which rooms are free, where a building is, when a
      midterm is.</li>
  </ul>
  <p>
    It sends nothing else. You can turn any of it off, and you can tell it to stop writing
    to you altogether, from inside Discord.
  </p>

  <h2>Linking your NetID</h2>
  {#if linked}
    <p>
      Your Discord account is linked to your VIA account already, so anything you mark on
      this website and anything you mark in Discord are the same list. You can see or undo
      the link on <a href="/account">your account page</a>.
    </p>
  {:else}
    <p>
      Linking your Discord account to your VIA account is optional and it is worth doing.
      Linked, what you mark on this website and what you mark in Discord are one list
      rather than two, and an organization's board can recognise you as one of their
      members. VIA tells you how to link once you have added it in Discord.
    </p>
  {/if}

  <h2>If you run an organization</h2>
  <p>
    Adding VIA to your organization's Discord server posts your events there, announces
    changes, and lets your members find rooms and exam dates without leaving Discord. That
    is a separate thing from adding it to your own account, and it needs Manage Server in
    the server you are adding it to.
  </p>
  {#if entry?.server_install_url}
    <p class="act">
      <a class="btn quiet" href={entry.server_install_url}
        target="_blank" rel="noopener noreferrer">
        Add VIA to a Discord server
      </a>
    </p>
  {/if}
  <p>
    Once it is in, run the setup command there and choose your organization. Your board
    can see and undo that connection from
    <a href="/dashboard">the logistics dashboard</a>.
  </p>
</ReadingPage>

<style>
  .act { margin: 22px 0; }
</style>
