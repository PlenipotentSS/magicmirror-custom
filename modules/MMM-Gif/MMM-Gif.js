Module.register("MMM-Gif", {

  defaults: {
    gifs: [],
    rotateInterval: 10 * 60 * 1000,
    pauseInterval: 60 * 1000,
    travelDuration: 4000,   // ms to cross the screen
    width: "150px",
    bottomOffset: "0px",
  },

  getStyles() {
    return ["MMM-Gif.css"];
  },

  start() {
    this.currentIndex = 0;

    const run = () => {
      const img = document.querySelector(".MMM-Gif-img");
      if (!img) return;

      // Swap gif src to restart animation from frame 1
      const src = "modules/MMM-Gif/gifs/" + this.config.gifs[this.currentIndex];
      img.src = "";
      img.src = src;

      // Remove class to reset, then re-add to trigger animation
      img.classList.remove("MMM-Gif-run");
      void img.offsetWidth; // force reflow
      img.style.animationDuration = this.config.travelDuration + "ms";
      img.classList.add("MMM-Gif-run");

      // Advance gif index for next run
      this.currentIndex = (this.currentIndex + 1) % this.config.gifs.length;
    };

    // Wait for DOM to be ready before first run
    setTimeout(run, 500);
    setInterval(run, this.config.pauseInterval);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-Gif";

    if (!this.config.gifs.length) {
      const err = document.createElement("div");
      err.className = "dimmed small";
      err.innerText = "No gifs configured.";
      wrapper.appendChild(err);
      return wrapper;
    }

    const img = document.createElement("img");
    img.className = "MMM-Gif-img";
    img.style.width = this.config.width;
    img.style.bottom = this.config.bottomOffset;
    img.src = "modules/MMM-Gif/gifs/" + this.config.gifs[this.currentIndex];
    wrapper.appendChild(img);

    return wrapper;
  },

});
