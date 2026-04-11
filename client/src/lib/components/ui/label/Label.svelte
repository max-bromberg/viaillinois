<script>
  export let htmlFor = undefined;
  let className = '';
  export { className as class };

  const base = 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70';
  $: classes = [base, className].filter(Boolean).join(' ');
</script>

<label for={htmlFor} class={classes}>
  <slot />
</label>
