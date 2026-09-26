"""Dialogs used by turtle.textinput() / turtle.numinput().

The browser shows the prompt; the answer comes back through the host.
"""

import _pyplay_host as _host


def askstring(title, prompt, **kw):
    return _host.ask_string(str(title), str(prompt))


def _ask_number(title, prompt, convert, kw):
    minval, maxval = kw.get("minvalue"), kw.get("maxvalue")
    while True:
        answer = _host.ask_string(str(title), str(prompt))
        if answer is None:
            return None
        try:
            value = convert(answer)
        except ValueError:
            prompt_retry = "请输入一个数字 (please enter a number)"
            prompt = f"{prompt_retry}\n{prompt}" if not str(prompt).startswith(prompt_retry) else prompt
            continue
        if minval is not None and value < minval:
            continue
        if maxval is not None and value > maxval:
            continue
        return value


def askfloat(title, prompt, **kw):
    return _ask_number(title, prompt, float, kw)


def askinteger(title, prompt, **kw):
    return _ask_number(title, prompt, int, kw)
