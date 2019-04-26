<script>
export let alt, icon, onClick;
</script>

<style>
.icon {
	padding: 0;
	border: 0;
	line-height: 0;
	background: none;
	display: block;
}
.icon > img {
	display: block;
}
</style>

<button class="icon" on:click={onClick}>
	<img alt="{alt}" src="https://baanreserveren.nl/images/icons/{icon}.png" />
</button>
