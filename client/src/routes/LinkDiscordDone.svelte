<script>
  const card = 'rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3';
  const body = 'text-sm text-muted-foreground leading-relaxed';
</script>

<svelte:head>
  <title>Your Discord account is linked: VIA</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="max-w-xl mx-auto space-y-6">
  <div class="{card}">
    <h1 class="text-2xl font-bold tracking-tight">Your Discord account is linked</h1>
    <p class="{body}">
      You can go back to Discord now. The VIA bot has sent you a direct message, and every
      command you run from here on knows who you are.
    </p>
    <p class="{body}">
      If you change your mind, you can undo this at any time from your
      <a href="/account" class="underline underline-offset-2">account page</a>, or with the
      unlink command on Discord.
    </p>
  </div>
</div>
