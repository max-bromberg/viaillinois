<script>
  export let event;

  $: start = new Date(event.start_time);
  $: date = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  $: time = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
</script>

<div class="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-16 select-none">
  <div class="text-center space-y-6 max-w-3xl">
    <p class="text-xl font-medium text-muted-foreground uppercase tracking-widest">{event.rso_name}</p>
    <h1 class="text-7xl font-bold leading-tight tracking-tight">{event.title}</h1>
    <div class="text-3xl text-muted-foreground space-y-2">
      <p>{date}</p>
      <p>{time}</p>
      <p class="text-2xl">{event.building} {event.room_number}</p>
    </div>
  </div>
</div>
