function showMessage(element, text) {
    if (!element) return;
    element.textContent = text;
    element.className = "message visible error"; // HTMLのCSS設計に合わせてクラスを付与
}

const changePasswordBtn = document.getElementById("change-password-btn");
if (changePasswordBtn) {
    changePasswordBtn.addEventListener("click", async () => {
        const message = document.getElementById("change-message");
        const newPassword = document.getElementById("new-password").value;
        const newPasswordConfirm = document.getElementById("new-password-confirm").value;

        if (!newPassword) return showMessage(message, "新しいパスワードを入力してください。");
        if (newPassword !== newPasswordConfirm) return showMessage(message, "確認用パスワードが一致しません。");

        changePasswordBtn.disabled = true;
        changePasswordBtn.textContent = "変更中...";

        try {
            const response = await fetch("/api/change_password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    new_password: newPassword,
                    new_password_confirm: newPasswordConfirm
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            location.href = result.redirect;
        } catch (error) {
            showMessage(message, error.message || "パスワードの変更に失敗しました。");
            changePasswordBtn.disabled = false;
            changePasswordBtn.textContent = "パスワードを変更する";
        }
    });
}