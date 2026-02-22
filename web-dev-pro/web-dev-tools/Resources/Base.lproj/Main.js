const userAgentElement = document.getElementById("user-agent");

if (userAgentElement) {
  userAgentElement.textContent = `User Agent: ${navigator.userAgent}`;
}
