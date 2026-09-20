package main

import (
	"embed"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

//go:embed all:web
var web embed.FS

func main() {
	sub, err := fs.Sub(web, "web")
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/cover", coverProxy)
	mux.Handle("/", http.FileServer(http.FS(sub)))

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	addr := "http://" + ln.Addr().String() + "/"

	go func() {
		if err := http.Serve(ln, mux); err != nil {
			log.Print(err)
		}
	}()

	cmd := openApp(addr)
	if cmd == nil {
		http.Serve(ln, mux)
		return
	}
	_ = cmd.Wait()
}

func coverProxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	raw := r.URL.Query().Get("u")
	if raw == "" {
		http.Error(w, "Missing image", http.StatusBadRequest)
		return
	}
	target, err := url.Parse(raw)
	if err != nil || (target.Scheme != "http" && target.Scheme != "https") {
		http.Error(w, "Bad image", http.StatusBadRequest)
		return
	}
	host := strings.ToLower(target.Hostname())
	if host == "localhost" || strings.HasPrefix(host, "127.") || strings.HasPrefix(host, "0.") || host == "::1" {
		http.Error(w, "Blocked", http.StatusForbidden)
		return
	}
	req, err := http.NewRequest(http.MethodGet, target.String(), nil)
	if err != nil {
		http.Error(w, "Bad image", http.StatusBadRequest)
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
	client := &http.Client{Timeout: 20 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		http.Error(w, "Cover unavailable", http.StatusBadGateway)
		return
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		http.Error(w, "Cover unavailable", http.StatusBadGateway)
		return
	}
	ctype := res.Header.Get("Content-Type")
	if ctype == "" {
		ctype = "image/jpeg"
	}
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, res.Body)
}

func openApp(appURL string) *exec.Cmd {
	data := filepath.Join(os.Getenv("LOCALAPPDATA"), "Sondergram", "profile")
	_ = os.MkdirAll(data, 0o755)
	bins := []string{
		filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(os.Getenv("ProgramFiles"), "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(os.Getenv("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Google", "Chrome", "Application", "chrome.exe"),
	}
	args := []string{"--app=" + appURL, "--user-data-dir=" + data, "--disable-features=TranslateUI"}
	for _, bin := range bins {
		if _, err := os.Stat(bin); err != nil {
			continue
		}
		cmd := exec.Command(bin, args...)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		if err := cmd.Start(); err != nil {
			continue
		}
		return cmd
	}
	_ = exec.Command("cmd", "/c", "start", "", appURL).Start()
	return nil
}
