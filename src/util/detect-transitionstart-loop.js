let dummy = document.createElement("div");
document.body.appendChild(dummy);
let property = "--bar-" + Date.now();
dummy.style.cssText = `${property}: 1; transition: ${property} 1ms step-start allow-discrete`;

export default await new Promise(resolve => {
	let eventsCount = 0;
	requestAnimationFrame(() => {
		setTimeout(_ => resolve(eventsCount > 1), 50);
		dummy.addEventListener("transitionstart", _ => eventsCount++);
		dummy.style.setProperty(property, "2");
	});
}).finally(() => dummy.remove());
