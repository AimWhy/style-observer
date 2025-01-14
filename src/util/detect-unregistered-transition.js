// Detect https://issues.chromium.org/issues/360159391
let dummy = document.createElement("div");
document.body.appendChild(dummy);
let property = "--foo-" + Date.now();
dummy.style.cssText = `${property}: 1; transition: ${property} 1ms step-start allow-discrete`;

export default new Promise(resolve => {
	requestAnimationFrame(() => {
		setTimeout(_ => resolve(true), 30);
		dummy.addEventListener("transitionstart", _ => resolve(false));
		dummy.style.setProperty(property, "2");
	});
}).finally(_ => dummy.remove());
