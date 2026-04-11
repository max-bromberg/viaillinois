<script>
  export let type = 'button';
  let className = '';
  export { className as class };
  export let disabled = false;
  export let variant = 'default';

  const base = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  $: variantClass = variants[variant] ?? variants.default;
  $: classes = [base, 'h-9 px-4 py-2', variantClass, className].filter(Boolean).join(' ');
</script>

<button {type} {disabled} class={classes} on:click {...$$restProps}>
  <slot />
</button>
