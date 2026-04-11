<script>
  export let type = 'text';
  export let value = '';
  export let placeholder = '';
  export let id = undefined;
  export let autocomplete = undefined;
  export let required = false;
  let className = '';
  export { className as class };

  const base = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
  $: classes = [base, className].filter(Boolean).join(' ');
</script>

<input
  {type}
  {id}
  {placeholder}
  {autocomplete}
  {required}
  bind:value
  class={classes}
  {...$$restProps}
/>
