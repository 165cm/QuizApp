export function triggerConfetti() {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confetti = [];
    const colors = ['#6366f1', '#ec4899', '#8b5cf6', '#10b981', '#f59e0b', '#ffffff'];

    for (let i = 0; i < 150; i++) {
        confetti.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height, // Start above
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 10 + 5,
            speedY: Math.random() * 3 + 2,
            speedX: Math.random() * 2 - 1,
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 10 - 5
        });
    }

    let animationId;

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let stillFalling = false;

        confetti.forEach(p => {
            p.y += p.speedY;
            p.x += Math.sin(p.y * 0.01) + p.speedX;
            p.rotation += p.rotationSpeed;

            if (p.y < canvas.height) {
                stillFalling = true;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            }
        });

        if (stillFalling) {
            animationId = requestAnimationFrame(animate);
        } else {
            canvas.remove();
        }
    }

    animate();

    // Auto cleanup after 5 seconds just in case
    setTimeout(() => {
        cancelAnimationFrame(animationId);
        if (canvas.parentNode) canvas.remove();
    }, 5000);
}
