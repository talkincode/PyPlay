try:
    raise ValueError('bad value')
except ValueError as e:
    print('caught', e, e.args)
raise KeyError('k')
